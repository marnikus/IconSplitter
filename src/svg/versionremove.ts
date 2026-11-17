// versionremove.ts — 🗑 on a version chip (2026-11-16): a row's SVG version or
// AI-source image version is taken out of its pair file AND out of its folder.
// The file is MOVED into the folder's `.removed versions` (lib/fs TRASH_DIR —
// every scan skips it), never destroyed, so ONE "svgVersionRemove" history
// entry undoes it whole: the file moves back and the pair file is restored.
// The timeline (localStorage) holds only paths and the pair file, never bytes.
// The panel lends its folder, history push and row update (`useVersionRemoveBinding`).
import { useEffect, useRef } from "react";
import { loadHandles } from "../batch/store";
import { ensureDirPath, probePath, readBytesAt, TRASH_DIR, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import type { PairMeta } from "../lib/pairmeta";
import { saveMetaAt } from "../selection/pairstore";
import { getAppState } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
import { SVG_HANDLE_KEY } from "../state/handlekeys";
import { toRow } from "./rowmodel";
import { bumpSvgFile } from "./usesvgtext";
import type { SvgRefs, SvgRow } from "./types";

export type VersionKind = "svg" | "image";
interface Move { from: string; to: string }
interface Side { id: string; metaPath: string; meta: PairMeta; moves: Move[] }

interface Binding {
  root: () => DirHandleLike | null;
  push: HistoryActions["push"];
  say: (msg: string, err?: boolean) => void;
  rows: () => SvgRow[];
  update: (id: string, meta: PairMeta) => void;
}
let live: Binding | null = null;

/** The mounted panel lends what a removal and its undo need. */
export function useVersionRemoveBinding(c: { refs: SvgRefs; rows: SvgRow[]; hist: Pick<HistoryActions, "push">; say: Binding["say"]; setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void }): void {
  const rows = useRef(c.rows);
  rows.current = c.rows;
  const { refs, hist, say, setRowsFn } = c;
  useEffect(() => {
    const b: Binding = {
      root: () => refs.root.current as DirHandleLike | null, push: hist.push, say, rows: () => rows.current,
      update: (id, meta) => { refs.metas.set(id, meta); setRowsFn((all) => all.map((r) => (r.source.id === id ? toRow(r.source, meta, false) : r))); },
    };
    live = b;
    return () => { if (live === b) live = null; };
  }, [refs, hist.push, say, setRowsFn]);
}

const split = (p: string) => { const at = p.lastIndexOf("/"); return { dir: at < 0 ? "" : p.slice(0, at), name: p.slice(at + 1) }; };

/** Moves one file (copy, then remove the original). */
async function moveFile(root: DirHandleLike, m: Move): Promise<void> {
  const bytes = await readBytesAt(root, m.from);
  if (bytes === null) throw new Error(`${m.from} is gone`);
  const to = split(m.to), from = split(m.from);
  await writeFileOverwrite(await ensureDirPath(root, to.dir), to.name, new Blob([bytes as BlobPart]));
  const parent = await probePath(root, from.dir);
  await parent?.removeEntry?.(from.name);
  if (m.to.endsWith(".svg")) bumpSvgFile(m.to);
  if (m.from.endsWith(".svg")) bumpSvgFile(m.from);
}

/** Where a removed file waits: `<its folder>/.removed versions/<its name>`. */
export const trashPathOf = (path: string): string => { const { dir, name } = split(path); return dir === "" ? `${TRASH_DIR}/${name}` : `${dir}/${TRASH_DIR}/${name}`; };

/** The pair file without that version (the choice falls back when it pointed at it). */
function withoutVersion(meta: PairMeta, kind: VersionKind, version: number): { meta: PairMeta; file: string } | null {
  if (kind === "svg") {
    const v = meta.versions.find((x) => x.version === version);
    if (v === undefined) return null;
    return { file: v.svgPath, meta: { ...meta, versions: meta.versions.filter((x) => x !== v), preferred: meta.preferred === version ? null : meta.preferred } };
  }
  const v = meta.imageVersions.find((x) => x.version === version);
  if (v === undefined) return null;
  return { file: v.file, meta: { ...meta, imageVersions: meta.imageVersions.filter((x) => x !== v), imagePreferred: meta.imagePreferred === version ? null : meta.imagePreferred } };
}

/** Applies one side: its file moves, then its pair file is written and the row redrawn. */
async function applySide(root: DirHandleLike, side: Side): Promise<void> {
  for (const m of side.moves) if (m.from !== "" && (await readBytesAt(root, m.from)) !== null) await moveFile(root, m);
  await saveMetaAt(root, side.metaPath, side.meta);
  live?.update(side.id, side.meta);
}

/** The two sides of one removal: after = without it (file in the trash), before = as it was. */
function sidesOf(row: SvgRow & { meta: PairMeta }, next: { meta: PairMeta; file: string }): { before: Side; after: Side } {
  const id = row.source.id, metaPath = row.source.metaPath;
  const move = { from: next.file, to: trashPathOf(next.file) };
  const has = next.file !== "";
  return {
    after: { id, metaPath, meta: next.meta, moves: has ? [move] : [] },
    before: { id, metaPath, meta: row.meta, moves: has ? [{ from: move.to, to: move.from }] : [] },
  };
}

/** 🗑: removes that version from the row and its folder, as one undo step. */
export async function removeVersion(id: string, kind: VersionKind, version: number): Promise<void> {
  const b = live;
  const root = b?.root() ?? null;
  const row = b?.rows().find((r) => r.source.id === id);
  if (b === null || root === null || row?.meta == null) return b?.say("This version cannot be removed now — no folder or record", true);
  const next = withoutVersion(row.meta, kind, version);
  if (next === null) return b.say("That version is already gone", true);
  const { before, after } = sidesOf(row as SvgRow & { meta: PairMeta }, next);
  try { await applySide(root, after); } catch (error) { return b.say(`Version not removed — ${error instanceof Error ? error.message : "the folder refused"}`, true); }
  const label = `Remove ${kind === "svg" ? "SVG" : "AI source"} v${version} of ${row.source.name}`;
  b.push({ type: "svgVersionRemove", label, origin: getAppState().tab, ids: [id], before, after });
  b.say(`${label} — moved to ${TRASH_DIR}; Undo brings it back`);
}

function sideOf(value: unknown): Side | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.metaPath !== "string" || !Array.isArray(value.moves)) return null;
  // The pair file this entry recorded itself: checked for its identity and shape, then written back whole.
  const meta = value.meta;
  if (!isRecord(meta) || meta.id !== value.id || !Array.isArray(meta.versions) || !Array.isArray(meta.imageVersions)) return null;
  const moves = value.moves.filter((m): m is Move => isRecord(m) && typeof m.from === "string" && typeof m.to === "string");
  return { id: value.id, metaPath: value.metaPath, meta: meta as unknown as PairMeta, moves };
}

/** Undo / redo of a removal. False (cursor stays) when it cannot be applied. */
export async function applyVersionRemove(value: unknown): Promise<boolean> {
  const side = sideOf(value);
  if (side === null) return false;
  const root = live?.root() ?? (await loadHandles(SVG_HANDLE_KEY))?.source ?? null;
  if (root === null) return false;
  try { await applySide(root, side); return true; } catch { return false; }
}
