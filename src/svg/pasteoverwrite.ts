// pasteoverwrite.ts — Paste in a row preview's corner (2026-11-17, user): the
// clipboard's SVG code or PNG image is written OVER the file that preview
// shows. Contract: docs/current/sor/svg-clipboard-paste.md.
//
// The overwrite is recoverable: the bytes that were at the target move into the
// folder's `.removed versions` under a unique name, the pasted bytes take the
// target's place, and ONE history entry (`svgPasteOverwrite`) undoes it whole —
// the paste parks back in a `.removed versions/.paste-<stamp>` staging and the
// old bytes return. Every direction is pure file moves; the timeline holds only
// paths and pair files, never bytes. The one paste that CREATES (a "No SVG"
// preview) writes the canonical v1 name and lets the registration owner record
// it; its entry carries the pair file with and without the new record.
// The panel lends its folder, history push and row update, like versionremove.
import { useEffect, useRef } from "react";
import { ensureDirPath, probePath, readBytesAt, TRASH_DIR, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import { svgFileName } from "../lib/svgfile";
import { mainImageOf } from "../lib/svgimgreg";
import type { PairMeta } from "../lib/pairmeta";
import { saveMetaAt } from "../selection/pairstore";
import { bumpSideThumb } from "../selection/thumbs";
import { getAppState } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
import { isReadablePng } from "./imgfiles";
import { previewTargetOf } from "./rowmodel";
import { runRegisterFor, type RegisterCtx } from "./registerexisting";
import { rebuiltRow } from "./styles";
import { bumpSvgFile } from "./usesvgtext";
import { validateSvg } from "../lib/svgvalidate";
import type { SvgRefs, SvgRow } from "./types";

export type PasteSide = "base" | "ai" | "svg";
interface Move { from: string; to: string }

/** One side of a paste entry: file moves plus, for the create case, the pair file. */
export interface PasteState {
  id: string;
  metaPath: string | null;
  meta: PairMeta | null;
  moves: Move[];
}

interface Binding {
  root: () => DirHandleLike | null;
  push: HistoryActions["push"];
  say: (msg: string, err?: boolean) => void;
  rows: () => SvgRow[];
  update: (id: string, meta: PairMeta) => void;
  ctx: () => RegisterCtx;
}
let live: Binding | null = null;
let seq = 0;

/** The mounted panel lends what a paste and its undo need. */
export function usePasteOverwriteBinding(c: { refs: SvgRefs; rows: SvgRow[]; hist: Pick<HistoryActions, "push">; say: (msg: string, err?: boolean) => void; setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void }): void {
  const rows = useRef(c.rows);
  rows.current = c.rows;
  const { refs, hist, say, setRowsFn } = c;
  useEffect(() => {
    const update = (id: string, meta: PairMeta) => {
      refs.metas.set(id, meta);
      setRowsFn((all) => all.map((r) => (r.source.id === id ? rebuiltRow(r, meta, false, (x) => refs.metas.get(x)) : r)));
    };
    const bound: Binding = {
      root: () => refs.root.current as DirHandleLike | null, push: hist.push, say, rows: () => rows.current, update,
      ctx: () => ({ refs, rows: rows.current, say, setRowsFn }),
    };
    live = bound;
    return () => { if (live === bound) live = null; };
  }, [refs, hist.push, say, setRowsFn]);
}

const split = (p: string) => { const at = p.lastIndexOf("/"); return { dir: at < 0 ? "" : p.slice(0, at), name: at < 0 ? p : p.slice(at + 1) }; };
const msg = (e: unknown) => (e instanceof Error ? e.message : "the folder refused");

/** Moves one file (copy, then remove the original) and bumps what caches it. */
async function moveFile(root: DirHandleLike, m: Move): Promise<void> {
  const bytes = await readBytesAt(root, m.from);
  if (bytes === null) throw new Error(`${m.from} is gone`);
  const to = split(m.to), from = split(m.from);
  await writeFileOverwrite(await ensureDirPath(root, to.dir), to.name, new Blob([bytes as BlobPart]));
  const parent = await probePath(root, from.dir);
  await parent?.removeEntry?.(from.name);
  if (m.to.endsWith(".svg") || m.from.endsWith(".svg")) { bumpSvgFile(m.to); bumpSvgFile(m.from); }
  else { bumpSideThumb(m.to); bumpSideThumb(m.from); }
}

/** Applies one side's moves in order; a missing source file ends the paste. */
async function applyMoves(root: DirHandleLike, moves: Move[]): Promise<void> {
  for (const m of moves) await moveFile(root, m);
}

/** The file this preview shows; `create` = the SVG paste that becomes v1. */
function targetOf(row: SvgRow, side: PasteSide): { path: string | null; create: boolean } {
  if (side === "base") return { path: row.baseAiPath ?? null, create: false };
  if (side === "ai") return { path: mainImageOf(row.meta, row.source.relPath), create: false };
  const target = previewTargetOf(row);
  if (target !== null) return { path: target.svgPath, create: false };
  return { path: `${row.source.dirPath}/${svgFileName(row.source.stem, 1)}`, create: true };
}

interface Payload { blob: Blob | null; why: string | null }

/** The clipboard's PNG item — or the honest reason there is none. */
async function clipboardPng(): Promise<Payload> {
  const clip = navigator.clipboard as (Clipboard & { read?: () => Promise<ClipboardItem[]> }) | undefined;
  if (clip?.read === undefined) return { blob: null, why: "this browser cannot read images from the clipboard" };
  let items: ClipboardItem[];
  try { items = await clip.read(); } catch { return { blob: null, why: "the clipboard refused to be read" }; }
  const item = items.find((i) => [...i.types].includes("image/png"));
  if (item !== undefined) return { blob: await item.getType("image/png"), why: null };
  const other = items.flatMap((i) => [...i.types]).find((t) => t.startsWith("image/"));
  return { blob: null, why: other === undefined ? "the clipboard holds no PNG image — copy an image first" : `the clipboard holds ${other}, not a PNG image` };
}

/** The clipboard's SVG code, past the same gate a generated version passes. */
async function clipboardSvg(): Promise<Payload> {
  const text = (await navigator.clipboard?.readText?.()) ?? "";
  if (text.trim() !== "") {
    const check = validateSvg(text);
    return check.ok ? { blob: new Blob([text], { type: "image/svg+xml" }), why: null }
      : { blob: null, why: `the pasted code is not a usable SVG — ${check.errors[0] ?? "invalid"}` };
  }
  const held = await clipboardPng();
  return held.blob !== null ? { blob: null, why: "the clipboard holds an image, not SVG code" } : { blob: null, why: "the clipboard is empty" };
}

/** Where pasted bytes wait before they move: `.removed versions/.paste-<stamp>/`. */
const stageOf = (stamp: string, name: string) => `${TRASH_DIR}/.paste-${stamp}/${name}`;

/** A refused paste leaves nothing behind, not even its staging. */
async function dropStage(root: DirHandleLike, stage: string): Promise<void> {
  const { dir, name } = split(stage);
  const parent = await probePath(root, dir);
  await parent?.removeEntry?.(name);
}

async function writeStage(root: DirHandleLike, stage: string, blob: Blob): Promise<void> {
  const { dir, name } = split(stage);
  await writeFileOverwrite(await ensureDirPath(root, dir), name, blob);
}

/** Everything one applied paste and its undo need, decided once up front. */
interface Plan {
  b: Binding;
  root: DirHandleLike;
  row: SvgRow;
  path: string;
  stage: string;
  stamp: string;
  create: boolean;
}

/** The overwrite: old bytes park under a unique name, the paste takes the path. */
async function overwrite({ b, root, row, path, stage, stamp }: Plan): Promise<void> {
  const { dir, name } = split(path);
  const trash = `${dir === "" ? "" : `${dir}/`}${TRASH_DIR}/${name}.overwritten-${stamp}`;
  const id = row.source.id;
  const after: PasteState = { id, metaPath: null, meta: null, moves: [{ from: path, to: trash }, { from: stage, to: path }] };
  const before: PasteState = { id, metaPath: null, meta: null, moves: [{ from: path, to: stage }, { from: trash, to: path }] };
  try { await applyMoves(root, after.moves); } catch (e) { return b.say(`Not pasted — ${msg(e)}`, true); }
  b.push({ type: "svgPasteOverwrite", label: `Pasted over ${name}`, origin: getAppState().tab, ids: [id], before, after });
  b.say(`Pasted over ${name} — the previous bytes are in .removed versions (Undo brings them back)`);
}

/** The create: v1's file appears, the registration owner records it. */
async function create({ b, root, row, path, stage }: Plan): Promise<void> {
  const id = row.source.id;
  const metaPath = row.source.metaPath;
  const beforeMeta = b.rows().find((r) => r.source.id === id)?.meta ?? null;
  try { await applyMoves(root, [{ from: stage, to: path }]); } catch (e) { return b.say(`Not pasted — ${msg(e)}`, true); }
  await runRegisterFor(b.ctx(), [id]);
  const afterMeta = b.ctx().refs.metas.get(id) ?? beforeMeta;
  b.push({
    type: "svgPasteOverwrite", label: "Pasted SVG became v1", origin: getAppState().tab, ids: [id],
    before: { id, metaPath, meta: beforeMeta, moves: [{ from: path, to: stage }] },
    after: { id, metaPath, meta: afterMeta, moves: [{ from: stage, to: path }] },
  });
}

/** The file this paste would hit — or the honest reason it cannot. */
async function targetFor(b: Binding, root: DirHandleLike, row: SvgRow, side: PasteSide): Promise<{ path: string; create: boolean } | null> {
  const target = targetOf(row, side);
  if (target.path === null || (!target.create && (await readBytesAt(root, target.path)) === null)) {
    b.say("this preview has no file to overwrite yet", true);
    return null;
  }
  return { path: target.path, create: target.create };
}

/** Reads, proves and stages the clipboard's bytes; says why not, else where they wait. */
async function stagePayload(b: Binding, root: DirHandleLike, side: PasteSide, path: string): Promise<{ stage: string; stamp: string } | null> {
  const payload = side === "svg" ? await clipboardSvg() : await clipboardPng();
  if (payload.why !== null || payload.blob === null) { b.say(payload.why ?? "the clipboard is empty", true); return null; }
  const stamp = `${Date.now().toString(36)}-${seq++}`;
  const stage = stageOf(stamp, split(path).name);
  await writeStage(root, stage, payload.blob);
  if (side !== "svg" && !(await isReadablePng(root, stage))) {
    await dropStage(root, stage);
    b.say("the clipboard PNG is not readable — nothing was written", true);
    return null;
  }
  return { stage, stamp };
}

/** Reads, proves and stages the clipboard for one target; says why not, else the plan. */
async function planOf(id: string, side: PasteSide): Promise<Plan | null> {
  const b = live;
  if (b === null) return null;
  const row = b.rows().find((r) => r.source.id === id);
  const root = b.root();
  if (row === undefined) return null;
  if (root === null) { b.say("No folder is open — nothing to paste into", true); return null; }
  const target = await targetFor(b, root, row, side);
  if (target === null) return null;
  const staged = await stagePayload(b, root, side, target.path);
  if (staged === null) return null;
  return { b, root, row, path: target.path, stage: staged.stage, stamp: staged.stamp, create: target.create };
}

/** Paste the clipboard over the file this preview shows (the corner button). */
export async function pasteInto(id: string, side: PasteSide): Promise<void> {
  const plan = await planOf(id, side);
  if (plan === null) return;
  if (plan.create) return create(plan);
  return overwrite(plan);
}

/** Undo / redo one paste entry: pure file moves, plus the pair file when it changed. */
export async function applyPasteOverwrite(value: unknown): Promise<boolean> {
  const b = live;
  if (b === null || !isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.moves)) return false;
  const side = value as unknown as PasteState;
  const root = b.root();
  if (root === null) return false;
  try { await applyMoves(root, side.moves as Move[]); } catch { return false; }
  if (side.metaPath !== null && side.meta !== null) {
    await saveMetaAt(root, side.metaPath, side.meta);
    b.update(side.id, side.meta);
  }
  return true;
}
