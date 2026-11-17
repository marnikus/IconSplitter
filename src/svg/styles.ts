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
import { mainImageOf } from "../lib/svgimgreg";
import { metaPathForAi, newPairMeta, sideOf, type PairMeta } from "../lib/pairmeta";
import { svgStem } from "../lib/svgfile";
import { baseRowId, styleFilesOf, styleOfFolder, styleRowId, variantVersions, type StyleFiles } from "../lib/svgstyles";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { getAppState, patchSvg } from "../state/appstore";
import { beginRegister } from "./registerprogress";
import type { SvgSource } from "./sources";
import { toRow } from "./rowmodel";
import type { SvgRefs, SvgRow } from "./types";
import type { Discovery } from "./sources";

export const STYLES_KEY = "iconSplitter.svg.styles.v1";

export interface StylePrefs { styles: string[]; active: string | null; showAll: boolean }

function readPrefs(): StylePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STYLES_KEY) ?? "{}") as Partial<StylePrefs>;
    const styles = Array.isArray(raw.styles) ? raw.styles.filter((s): s is string => typeof s === "string" && styleOfFolder(`_${s}`) !== null) : [];
    const active = typeof raw.active === "string" && styles.includes(raw.active) ? raw.active : null;
    return { styles, active, showAll: raw.showAll === true };
  } catch { return { styles: [], active: null, showAll: false }; }
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
    if (meta == null) return row;
    const face = baseFaceOf(meta.id, metaOf) ?? mainImageOf(row.meta, row.source.relPath);
    return { ...toRow(styleSourceOf(row.source, meta), meta, false), baseAiPath: face };
  });
}

/** The base face a style row shows beside its own previews (2026-11-16): the
    base pair's main image — the same file the base row itself shows (RC8). */
export function baseFaceOf(id: string, metaOf: (id: string) => PairMeta | null | undefined): string | undefined {
  const base = baseRowId(id);
  if (base === id) return undefined;
  const m = metaOf(base);
  return m == null ? undefined : mainImageOf(m, m.ai.relPath);
}

/** A row rebuilt from a fresh pair file keeps its style's base face
    (2026-11-17): EVERY in-place rebuild (🗑 removals, run saves, registers)
    goes through here, so a style row can never lose its Base · Stroke
    preview; with no base pair in hand the row keeps the face it already had. */
export function rebuiltRow(row: SvgRow, meta: PairMeta | null, corrupt: boolean, metaOf: (id: string) => PairMeta | null | undefined): SvgRow {
  const next = toRow(row.source, meta, corrupt);
  const face = baseFaceOf(row.source.id, metaOf) ?? row.baseAiPath;
  return face === undefined ? next : { ...next, baseAiPath: face };
}

/** The pair file a style row owns, named by the folder's own names — the SAME
    rule registration uses (the style image may carry a version, `_v2`); null
    when the folder or its style image is not there (2026-11-17, restart scan). */
export async function styleMetaPathAt(root: DirHandleLike, dirPath: string, stem: string, style: string): Promise<string | null> {
  const rel = dirPath === "" ? `_${style}` : `${dirPath}/_${style}`;
  const dir = await probePath(root, rel).catch(() => null);
  if (dir === null || dir.kind !== "directory") return null;
  const names: string[] = [];
  for await (const [name, h] of dir.entries()) if (h.kind === "file") names.push(name);
  const name = styleNameOf(styleFilesOf(stem, style, names));
  return name === null ? null : metaPathForAi(`${rel}/${name}`);
}

/** Rows rebuilt for a style switch: from the scan's base sources and the freshest pair files. */
export function rowsForStyle(discovery: Discovery, refs: SvgRefs, style: string | null): SvgRow[] {
  const metaOf = (id: string) => (refs.metas.has(id) ? refs.metas.get(id) : discovery.metas.get(id));
  const bases = discovery.sources.map((s) => toRow(s, metaOf(s.id) ?? null, false));
  return styledRows(bases, metaOf, style);
}

/** Base and each registered style become separate rows with their own pair-file review status. */
export function rowsForAllStyles(discovery: Discovery, metaOf: (id: string) => PairMeta | null | undefined, styles: readonly string[]): SvgRow[] {
  const bases = discovery.sources.map((s) => toRow(s, metaOf(s.id) ?? null, false));
  const byBase = new Map<string, SvgRow[]>();
  for (const style of styles) {
    for (const row of styledRows(bases, metaOf, style)) {
      if (row.source.id === baseRowId(row.source.id)) continue;
      const base = baseRowId(row.source.id);
      byBase.set(base, [...(byBase.get(base) ?? []), row]);
    }
  }
  return bases.flatMap((base) => [base, ...(byBase.get(base.source.id) ?? [])]);
}

function rowsForPrefs(discovery: Discovery, refs: SvgRefs): SvgRow[] {
  const metaOf = (id: string) => (refs.metas.has(id) ? refs.metas.get(id) : discovery.metas.get(id));
  return prefs.showAll ? rowsForAllStyles(discovery, metaOf, prefs.styles) : rowsForStyle(discovery, refs, prefs.active);
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
async function startMeta(a: StyleArgs, dir: string, aiRel: string, path: string): Promise<PairMeta> {
  const read = await loadMetaAt(a.root, path);
  return read.meta ?? newPairMeta({ id: styleRowId(a.base.id, a.style), base: a.base.base, suffix: a.base.suffix, dirPath: dir, ai: sideOf(aiRel, ""), source: null });
}

/** A style row is approved like its row: the decision comes from the base pair until it has its own. */
function inherited(prev: PairMeta, base: PairMeta | null): Pick<PairMeta, "decision" | "reviewedAt"> {
  return { decision: prev.decision ?? base?.decision ?? null, reviewedAt: prev.reviewedAt ?? base?.reviewedAt ?? null };
}

/** The style pair file for one row and one style folder — new, or the old one with any new variants. */
async function styleMeta(a: StyleArgs): Promise<{ path: string; meta: PairMeta } | null> {
  const files = styleFilesOf(a.base.stem, a.style, a.names);
  const name = styleNameOf(files);
  if (name === null || files.variants.length === 0) return null;
  const dir = withDir(a.base.dirPath, `_${a.style}`);
  // The style's own name stands for its AI face: its SVGs are `<that stem>.svg` / `_v2.svg`; the variant chosen is what shows and is vectorised.
  const aiRel = withDir(dir, name);
  const path = metaPathForAi(aiRel);
  const prev = await startMeta(a, dir, aiRel, path);
  const imageVersions = variantVersions(dir, files, prev.imageVersions, new Date().toISOString());
  return { path, meta: { ...prev, ...inherited(prev, a.baseMeta), id: styleRowId(a.base.id, a.style), dirPath: dir, imageVersions, imagePreferred: prev.imagePreferred ?? imageVersions[0]?.version ?? null } };
}

async function folderNames(dir: DirHandleLike): Promise<{ dirs: Array<[string, DirHandleLike]>; files: string[] }> {
  const dirs: Array<[string, DirHandleLike]> = [], files: string[] = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "directory") dirs.push([name, h as DirHandleLike]);
    else files.push(name);
  }
  return { dirs, files };
}

/** One row: every `_<style>` folder beside it → its style pair file. Answers the styles registered. */
async function registerRow(root: DirHandleLike, refs: SvgRefs, base: SvgSource): Promise<string[]> {
  const dir = await probePath(root, base.dirPath).catch(() => null);
  if (dir === null) return [];
  const styleDirs = (await folderNames(dir)).dirs
    .map(([folder, handle]) => ({ style: styleOfFolder(folder), handle }))
    .filter((d): d is { style: string; handle: DirHandleLike } => d.style !== null);
  if (styleDirs.length === 0) return [];
  const baseMeta = refs.metas.get(base.id) ?? null;
  const results = await Promise.all(styleDirs.map(async ({ style, handle }) => {
    const plan = await styleMeta({ root, base, baseMeta, style, names: (await folderNames(handle)).files });
    if (plan === null) return null;
    await saveMetaAt(root, plan.path, plan.meta);
    refs.metas.set(plan.meta.id, plan.meta);
    return style;
  }));
  return results.filter((s): s is string => s !== null);
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
  c.say(`Registering styles in ${bases.length} item folder(s)…`);
  const bar = beginRegister(c.refs, "styles", bases.length);
  const styles = new Set(prefs.styles);
  let rows = 0;
  const CONCURRENCY = 16;
  let next = 0;
  try {
    const worker = async () => {
      while (next < bases.length && !bar.cancelled()) {
        const done = await registerOne(bar, root, c.refs, bases[next++]);
        if (done.added > 0) rows++;
        done.styles.forEach((s) => styles.add(s));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, bases.length) }, worker));
  } catch (error) {
    bar.fail();
    throw error;
  }
  bar.finish();
  setPrefs({ ...prefs, styles: [...styles].sort() });
  if (c.discovery !== null) c.setRows(rowsForPrefs(c.discovery, c.refs));
  c.say(rows === 0 ? "No style folders (_<style> with numbered images) found in the selected items" : `Styles registered for ${rows} of ${bases.length} item(s): ${[...styles].join(", ")}`);
}

/** One item folder through the register bar: its styles, and how many landed. */
async function registerOne(bar: ReturnType<typeof beginRegister>, root: DirHandleLike, refs: StyleCtx["refs"], base: SvgSource): Promise<{ added: number; styles: string[] }> {
  bar.reading(base.name);
  try {
    const got = await registerRow(root, refs, base);
    bar.settled({ registered: got.length, skipped: 0 });
    return { added: got.length, styles: got };
  } catch { // reported in the bar's count, never as a failed whole run
    bar.settled({ registered: 0, skipped: 0 });
    return { added: 0, styles: [] };
  }
}

/** The pinned bar's style switch: every row that has it shows that style; the selection follows. */
export function switchStyle(c: StyleCtx, style: string | null, showAll = false): void {
  setPrefs({ ...prefs, active: showAll ? prefs.active : style, showAll });
  if (c.discovery === null) return;
  const next = rowsForPrefs(c.discovery, c.refs);
  const ids = new Set(next.map((r) => r.source.id));
  const moved = (id: string) => {
    if (showAll && ids.has(id)) return id;
    const base = baseRowId(id);
    const target = showAll || style === null ? base : styleRowId(base, style);
    return ids.has(target) ? target : base;
  };
  const svg = getAppState().svg;
  patchSvg({ checked: [...new Set(svg.checked.map(moved))], activeId: svg.activeId === null ? null : moved(svg.activeId) });
  c.setRows(next);
}

/** Image styles (2026-11-16): register the selected rows' `_<style>` folders; switch the shown style. */
export interface StyleActions { registerStyles: (ids: string[]) => void; setStyle: (style: string | null, showAll?: boolean) => void }

export function useStyleActions(c: { refs: SvgRefs; rows: SvgRow[]; m: { discovery: Discovery | null }; say: StyleCtx["say"]; setRows: StyleCtx["setRows"] }): StyleActions {
  const latest = useRef<StyleCtx>({ ...c, discovery: c.m.discovery });
  latest.current = { refs: c.refs, rows: c.rows, discovery: c.m.discovery, say: c.say, setRows: c.setRows };
  return {
    registerStyles: useCallback((ids: string[]) => { void registerStyles(latest.current, ids); }, []),
    setStyle: useCallback((style: string | null, showAll = false) => switchStyle(latest.current, style, showAll), []),
  };
}
