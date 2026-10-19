// imgprepare.ts — the exact square reference previews an image-edit run will send.
// Capture main-image bytes and stable pair identities once before confirmation;
// the response maps to this snapshot, never to whichever rows are sorted later.

import { loadSheet } from "../lib/dom";
import type { DirHandleLike } from "../lib/fs";
import { resolveSize, type Connection } from "../lib/svgconnections";
import { compositeEditPrompt, planImageEditGroups, type ImageEditGroup, type ImageEditSource } from "../lib/svgimgbatch";
import { mainImageOf } from "../lib/svgimgreg";
import { canvasToPng, type CompositeImage } from "../lib/svgcanvas";
import { renderEditSheet } from "../lib/svgimgpixels";
import { readReferenceImage } from "./imgregfiles";
import type { SvgRow } from "./types";

export interface PreparedImageSource {
  row: SvgRow;
  path: string;
  fingerprint: string;
  /** The version shown when confirmation was prepared. */
  preferred: number | null;
  blob: Blob;
}
export interface PreparedImageGroup {
  plan: ImageEditGroup;
  sources: PreparedImageSource[];
  /** The preview and the sole multipart `image[]` part are this very Blob. */
  reference: Blob;
  prompt: string;
}
export interface PreparedImageRun {
  groups: PreparedImageGroup[];
  /** A bad group is named but never sent; other previewed groups may proceed. */
  skipped: { ids: string[]; reason: string }[];
  root: DirHandleLike;
  conn: Connection;
  prompt: string;
  ids: string[];
  count: number;
}
export interface PrepareImageArgs {
  root: DirHandleLike;
  rows: readonly SvgRow[];
  ids: readonly string[];
  count: number;
  conn: Connection;
  prompt: string;
}

/** Fail before sending if a source, setting or reference cannot make its preview. */
export async function prepareImageEditRun(args: PrepareImageArgs): Promise<PreparedImageRun> {
  const side = squareSide(args.conn);
  const selected = selectedRows(args.rows, args.ids);
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error("Choose a positive icon count");
  const groups: PreparedImageGroup[] = [];
  const skipped: PreparedImageRun["skipped"] = [];
  for (let i = 0; i < selected.length; i += args.count) {
    const ids = args.ids.slice(i, i + args.count);
    try {
      groups.push(await prepareSelectedGroup(args, selected.slice(i, i + args.count), ids, side));
    } catch (error) {
      skipped.push({ ids: [...ids], reason: error instanceof Error ? error.message : String(error) });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (groups.length === 0) throw new Error(skipped[0]?.reason ?? "No selected image could be prepared");
  return { groups, skipped, root: args.root, conn: { ...args.conn, image: { ...args.conn.image } }, prompt: args.prompt, ids: [...args.ids], count: args.count };
}

function squareSide(conn: Connection): number {
  const size = resolveSize(conn.image);
  const match = /^(\d+)x\1$/.exec(size);
  if (match === null) throw new Error("Choose an explicit square image output size for composite editing");
  return Number(match[1]);
}

function selectedRows(rows: readonly SvgRow[], ids: readonly string[]): (SvgRow | undefined)[] {
  const byId = new Map(rows.map((row) => [row.source.id, row]));
  if (ids.length === 0) throw new Error("Select at least one AI source");
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate selected pair identity");
  return ids.map((id) => byId.get(id));
}

async function prepareSelectedGroup(args: PrepareImageArgs, selected: readonly (SvgRow | undefined)[], ids: readonly string[], side: number): Promise<PreparedImageGroup> {
  const snapshots: PreparedImageSource[] = [];
  for (let i = 0; i < selected.length; i++) {
    const row = selected[i];
    if (!row || row.corrupt) throw new Error(`The selected source ${ids[i]} is missing or has an unreadable pair file`);
    snapshots.push(await captureSource(args.root, row));
  }
  const names = snapshots.map((source) => source.row.source.name);
  const inputs: ImageEditSource[] = snapshots.map((source) => ({
    id: source.row.source.id,
    name: names.filter((name) => name === source.row.source.name).length > 1 ? source.path : source.row.source.name,
    fingerprint: source.fingerprint,
  }));
  const [plan] = planImageEditGroups(inputs, args.count, side);
  return prepareGroup(plan, snapshots, args.prompt);
}

async function captureSource(root: DirHandleLike, row: SvgRow): Promise<PreparedImageSource> {
  const path = mainImageOf(row.meta, row.source.relPath);
  const blob = await readReferenceImage(root, path);
  if (blob === null || blob.size === 0) throw new Error(`The current AI image ${row.source.name} could not be read`);
  return { row, path, blob, fingerprint: await fingerprintOf(blob), preferred: row.meta?.imagePreferred ?? null };
}

async function prepareGroup(plan: ImageEditGroup, sources: PreparedImageSource[], prompt: string): Promise<PreparedImageGroup> {
  const decoded: Awaited<ReturnType<typeof decodeSource>>[] = [];
  try {
    for (const source of sources) decoded.push(await decodeSource(source));
    const canvas = renderEditSheet(plan, decoded.map((d) => d.image));
    const reference = await canvasToPng(canvas);
    if (reference.type !== "image/png" || reference.size === 0) throw new Error("The composite could not be encoded as PNG");
    return { plan, sources, reference, prompt: compositeEditPrompt(prompt, plan.cols, plan.cells.length) };
  } finally {
    decoded.forEach((d) => d.close());
  }
}

async function decodeSource(source: PreparedImageSource): Promise<{ image: CompositeImage; close: () => void }> {
  const file = new File([source.blob], source.path.slice(source.path.lastIndexOf("/") + 1), { type: source.blob.type });
  const img = await loadSheet(file);
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const close = () => { if ("close" in img && typeof img.close === "function") img.close(); };
  if (w < 1 || h < 1) { close(); throw new Error(`The current AI image ${source.row.source.name} could not be decoded`); }
  return { image: { src: img, w, h }, close };
}

/** Used again before Apply so a replaced image cannot inherit an old response. */
export async function fingerprintOf(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `${bytes.length}:${(hash >>> 0).toString(16)}`;
}
