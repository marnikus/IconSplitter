// imgcommit.ts — one image-edit outcome becomes one pair's own version.
// The image writer owns the latest in-memory fields so a concurrent SVG save
// cannot erase them; each disk file is unique and the sidecar is verified.

import type { DirHandleLike } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import type { Connection } from "../lib/svgconnections";
import { imageRegenDir, imageRegenFileName, nextImageVersion, type ImageVersion } from "../lib/svgimgreg";
import { saveMetaAt } from "../selection/pairstore";
import type { SvgCtx } from "./actions";
import { listRegenNames, writeRegenImage } from "./imgregfiles";
import type { ImageRegenResult } from "./imgrunner";
import { metaForSource } from "./sources";
import type { SvgRow } from "./types";

export interface ImageCommitContext { c: SvgCtx; root: DirHandleLike; conn: Connection; prompt: string }

/** Memory first: an SVG save meanwhile takes these image fields from this copy. */
export async function recordImageResult(run: ImageCommitContext, row: SvgRow, result: ImageRegenResult): Promise<ImageVersion> {
  const { c } = run;
  const id = row.source.id;
  const entry = await imageEntry(run, row, (c.refs.metas.get(id) ?? row.meta)?.imageVersions ?? [], result);
  const prev: PairMeta = c.refs.metas.get(id) ?? row.meta ?? metaForSource(row.source, null);
  const meta: PairMeta = { ...prev, imageVersions: [...prev.imageVersions, entry], imagePreferred: entry.status === "done" ? entry.version : prev.imagePreferred };
  c.refs.metas.set(id, meta);
  c.setRowsFn((rs) => rs.map((r) => (r.source.id === id ? { ...r, meta } : r)));
  const refused = await saveMetaAt(run.root, row.source.metaPath, meta).then(() => null, (error: unknown) => messageOf(error));
  if (refused !== null) throw new Error(`its pair file could not be written (${refused}) — the next save of this pair records it`);
  return entry;
}

/** A failed attempt names the path it would have used but writes no image. */
async function imageEntry(run: ImageCommitContext, row: SvgRow, history: readonly ImageVersion[], result: ImageRegenResult): Promise<ImageVersion> {
  const { stem, dirPath } = row.source;
  const version = nextImageVersion(stem, history, await listRegenNames(run.root, dirPath));
  const name = imageRegenFileName(stem, version);
  const base = { version, file: `${imageRegenDir(dirPath)}/${name}`, prompt: run.prompt, model: run.conn.model, requestId: result.requestId ?? null, updatedAt: new Date().toISOString() };
  if (result.status !== "done" || result.blob === undefined) return { ...base, status: "failed", error: result.error ?? "unknown error" };
  try {
    return { ...base, file: await writeRegenImage(run.root, dirPath, name, result.blob), status: "done", error: null };
  } catch (error) {
    return { ...base, status: "failed", error: `the new image could not be saved (${messageOf(error)})` };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
