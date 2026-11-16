// styles.ts — image STYLES in the Generate SVG tab (2026-11-16, lib/svgstyles.ts).
// "Register styles" looks into every selected row's folder for `_<style>`
// folders; each style found becomes the row's own STYLE PAIR FILE inside that
// folder (`<style stem>.svg.json`, id `<row id>~<style>`): its numbered images are
// the image variants, so choosing one, generating, versions and review all run
// through the SAME row machinery as the base line-stroke style. The style picked
// in the pinned bar swaps every row that has it for its style row.
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import { probePath } from "../lib/fs";
import { metaPathForAi, newPairMeta, sideOf, type PairMeta } from "../lib/pairmeta";
import { svgStem } from "../lib/svgfile";
import { baseRowId, styleFilesOf, styleOfFolder, styleRowId, variantVersions, type StyleFiles } from "../lib/svgstyles";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { getAppState, patchSvg } from "../state/appstore";
import type { SvgSource } from "./sources";
import { toRow } from "./rowmodel";
import { beginRegister, registerRunning, type RegisterSession } from "./registerprogress";
import type { SvgRefs, SvgRow } from "./types";
import type { Discovery } from "./sources";

export const STYLES_KEY = "iconSplitter.svg.styles.v1";

export interface StylePrefs { styles: string[]; active: string | null }

function readPrefs(): StylePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STYLES_KEY) ?? "{}") as Partial<StylePrefs>;
    const styles = Array.isArray(raw.styles) ? raw.styles.filter((s): s is string => typeof s === "string" && styleOfFolder(`_${s}`) !== null) : [];
    const active = typeof raw.active === "string" && styles.includes(raw.active) ? raw.active : null;
    return { styles, active };
  } catch { return { styles: [], active: null }; }
}

let prefs = readPrefs();
const listeners = new Set<() => void>();
function setPrefs(next: StylePrefs): void {
  prefs = next;
  try { localStorage.setItem(STYLES_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  for (const l of listeners) l();
}
export const stylePrefs = (): StylePrefs => prefs;
export function useStylePrefs(): StylePrefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, stylePrefs);
}
/** Tests: start clean. */
export function resetStylePrefs(): void { prefs = readPrefs(); }

/** The source a style row stands on: its pair file's own image, folder and stem. */
export function styleSourceOf(base: SvgSource, meta: PairMeta): SvgSource {
  return {
    ...base, id: meta.id, name: meta.ai.name, stem: svgStem(meta.ai.name), relPath: meta.ai.relPath, dirPath: meta.dirPath,
    fingerprint: meta.ai.fingerprint, problems: [], metaPath: metaPathForAi(meta.ai.relPath),
  };
}

/** Every row in the active style when it has it, else as it is (base). */
export function styledRows(bases: readonly SvgRow[], metaOf: (id: string) => PairMeta | null | undefined, style: string | null): SvgRow[] {
  if (style === null) return [...bases];
  return bases.map((row) => {
    const meta = metaOf(styleRowId(row.source.id, style));
    return meta == null ? row : toRow(styleSourceOf(row.source, meta), meta, false);
  });
}

/** Rows rebuilt for a style switch: from the scan's base sources and the freshest pair files. */
export function rowsForStyle(discovery: Discovery, refs: SvgRefs, style: string | null): SvgRow[] {
  const metaOf = (id: string) => (refs.metas.has(id) ? refs.metas.get(id) : discovery.metas.get(id));
  const bases = discovery.sources.map((s) => toRow(s, metaOf(s.id) ?? null, false));
  return styledRows(bases, metaOf, style);
}

const withDir = (dir: string, name: string) => (dir === "" ? name : `${dir}/${name}`);

/** The style's stem: its own image's name, else its first variant's without `_NN`. */
function styleNameOf(files: StyleFiles): string | null {
  if (files.main !== null) return files.main;
  const first = files.variants[0]?.name;
  return first === undefined ? null : first.replace(/_\d+(\.[^.]+)$/, "$1");
}

interface StyleArgs { root: DirHandleLike; base: SvgSource; baseMeta: PairMeta | null; style: string; names: string[] }

/** The pair file a style starts from: the one on disk, else a new one beside its images. */
async function startMeta(a: StyleArgs, dir: string, aiRel: string, path: string): Promise<{ meta: PairMeta; added: boolean }> {
  const read = await loadMetaAt(a.root, path);
  if (!read.missing && read.meta === null) throw new Error("Style pair file could not be read");
  const meta = read.meta ?? newPairMeta({ id: styleRowId(a.base.id, a.style), base: a.base.base, suffix: a.base.suffix, dirPath: dir, ai: sideOf(aiRel, ""), source: null });
  return { meta, added: read.missing };
}

/** A style row is approved like its row: the decision comes from the base pair until it has its own. */
function inherited(prev: PairMeta, base: PairMeta | null): Pick<PairMeta, "decision" | "reviewedAt"> {
  return { decision: prev.decision ?? base?.decision ?? null, reviewedAt: prev.reviewedAt ?? base?.reviewedAt ?? null };
}

/** The style pair file for one row and one style folder — new, or the old one with any new variants. */
async function styleMeta(a: StyleArgs): Promise<{ path: string; meta: PairMeta; added: boolean } | null> {
  const files = styleFilesOf(a.base.stem, a.style, a.names);
  const name = styleNameOf(files);
  if (name === null || files.variants.length === 0) return null;
  const dir = withDir(a.base.dirPath, `_${a.style}`);
  // The style's own name stands for its AI face: its SVGs are `<that stem>.svg` / `_v2.svg`; the variant chosen is what shows and is vectorised.
  const aiRel = withDir(dir, name);
  const path = metaPathForAi(aiRel);
  const { meta: prev, added } = await startMeta(a, dir, aiRel, path);
  const imageVersions = variantVersions(dir, files, prev.imageVersions, new Date().toISOString());
  return { path, added, meta: { ...prev, ...inherited(prev, a.baseMeta), id: styleRowId(a.base.id, a.style), dirPath: dir, imageVersions, imagePreferred: prev.imagePreferred ?? imageVersions[0]?.version ?? null } };
}

async function folderNames(dir: DirHandleLike): Promise<{ dirs: Array<[string, DirHandleLike]>; files: string[] }> {
  const dirs: Array<[string, DirHandleLike]> = [], files: string[] = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "directory") dirs.push([name, h as DirHandleLike]);
    else files.push(name);
  }
  return { dirs, files };
}

interface StyleOutcome { styles: string[]; registered: number; skipped: number }

/** One row: each valid style folder contributes a pair file, independently. */
async function registerRow(root: DirHandleLike, refs: SvgRefs, base: SvgSource): Promise<StyleOutcome> {
  const dir = await probePath(root, base.dirPath);
  if (dir === null) throw new Error("Item folder could not be read");
  const out: StyleOutcome = { styles: [], registered: 0, skipped: 0 };
  for (const [folder, handle] of (await folderNames(dir)).dirs) {
    const style = styleOfFolder(folder);
    if (style === null) continue;
    try {
      const plan = await styleMeta({ root, base, baseMeta: refs.metas.get(base.id) ?? null, style, names: (await folderNames(handle)).files });
      if (plan === null) continue;
      await saveMetaAt(root, plan.path, plan.meta);
      refs.metas.set(plan.meta.id, plan.meta);
      out.styles.push(style);
      if (plan.added) out.registered++;
    } catch { out.skipped++; }
  }
  return out;
}

export interface StyleCtx {
  refs: SvgRefs;
  rows: SvgRow[];
  discovery: Discovery | null;
  say: (msg: string, err?: boolean) => void;
  setRows: (rows: SvgRow[]) => void;
}

/** "Register styles" on the selected rows: style pair files written, the style list grown. */
export async function registerStyles(c: StyleCtx, ids: readonly string[]): Promise<void> {
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return c.say("No folder is open", true);
  const bases = [...new Set(ids.map(baseRowId))].flatMap((id) => c.discovery?.sources.find((s) => s.id === id) ?? []);
  if (bases.length === 0) return c.say("Select the items whose style folders should be registered", true);
  if (registerRunning(c.refs)) return c.say("A registration is already running — wait for it to finish", true);
  c.say(`Registering styles in ${bases.length} item folder(s)…`);
  const bar = beginRegister(c.refs, "styles", bases.length);
  try {
    const tally = await registerStyleFolders(c, root, bases, bar);
    setPrefs({ ...prefs, styles: [...tally.styles].sort() });
    if (c.discovery !== null) c.setRows(rowsForStyle(c.discovery, c.refs, prefs.active));
    if (tally.skipped > 0 && !bar.cancelled()) bar.fail(); else bar.finish();
    c.say(styleSummary(tally, bases.length, bar.cancelled()), tally.skipped > 0);
  } catch (error) { bar.fail(); throw error; }
}

interface StyleTally { styles: Set<string>; rows: number; skipped: number; processed: number }

/** Settle each selected item independently; cancellation takes effect between items. */
async function registerStyleFolders(c: StyleCtx, root: DirHandleLike, bases: SvgSource[], bar: RegisterSession): Promise<StyleTally> {
  const tally: StyleTally = { styles: new Set(prefs.styles), rows: 0, skipped: 0, processed: 0 };
  for (const base of bases) {
    if (bar.cancelled()) break;
    bar.reading(base.name);
    const out = await registerRow(root, c.refs, base).catch(() => ({ styles: [], registered: 0, skipped: 1 }));
    if (out.styles.length > 0) tally.rows++;
    out.styles.forEach((s) => tally.styles.add(s));
    tally.skipped += out.skipped; tally.processed++;
    bar.settled(out);
  }
  return tally;
}

function styleSummary(tally: StyleTally, total: number, cancelled: boolean): string {
  const prefix = cancelled ? `Registration cancelled after ${tally.processed} of ${total} item(s). ` : "";
  const result = tally.rows === 0 ? "No styles registered in the processed items" : `Styles registered for ${tally.rows} of ${tally.processed} item(s): ${[...tally.styles].join(", ")}`;
  return `${prefix}${result}${tally.skipped ? ` · ${tally.skipped} folder(s) could not be read or saved` : ""}`;
}

/** The pinned bar's style switch: every row that has it shows that style; the selection follows. */
export function switchStyle(c: StyleCtx, style: string | null): void {
  setPrefs({ ...prefs, active: style });
  if (c.discovery === null) return;
  const next = rowsForStyle(c.discovery, c.refs, style);
  const ids = new Set(next.map((r) => r.source.id));
  const moved = (id: string) => { const b = baseRowId(id), s = style === null ? b : styleRowId(b, style); return ids.has(s) ? s : b; };
  const svg = getAppState().svg;
  patchSvg({ checked: svg.checked.map(moved), activeId: svg.activeId === null ? null : moved(svg.activeId) });
  c.setRows(next);
}

/** Image styles (2026-11-16): register the selected rows' `_<style>` folders; switch the shown style. */
export interface StyleActions { registerStyles: (ids: string[]) => void; setStyle: (style: string | null) => void }

export function useStyleActions(c: { refs: SvgRefs; rows: SvgRow[]; m: { discovery: Discovery | null }; say: StyleCtx["say"]; setRows: StyleCtx["setRows"] }): StyleActions {
  const latest = useRef<StyleCtx>({ ...c, discovery: c.m.discovery });
  latest.current = { refs: c.refs, rows: c.rows, discovery: c.m.discovery, say: c.say, setRows: c.setRows };
  return {
    registerStyles: useCallback((ids: string[]) => { void registerStyles(latest.current, ids); }, []),
    setStyle: useCallback((style: string | null) => switchStyle(latest.current, style), []),
  };
}
