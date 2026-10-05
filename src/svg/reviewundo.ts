// reviewundo.ts — the SVG review decision's cross-tab path (RULE 12, I-41).
// A version's review lives in the pair's OWN file beside the images, so this
// module reads the remembered root handle, finds the pair file from the source
// index (id -> AI image path) and writes the version back. A mounted Generate
// SVG panel binds itself here first, so a click and an undo both land in the
// same code path.

import { loadHandles } from "../batch/store";
import { withVersion, type PairMeta } from "../lib/pairmeta";
import type { ReviewStatus } from "../lib/svgmodel";
import type { DirHandleLike } from "../lib/fs";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { metaFromRecord } from "../selection/pairrecord";
import { loadSourceIndex, metaPathOfEntry, type IndexEntry } from "../state/sourceindex";

export const SVG_HANDLE_KEY = "__svg__";

/** One decision a history entry carries: which version, and its review status. */
export interface SvgReviewRec {
  id: string;
  version: number;
  review: ReviewStatus;
}

export interface SvgReviewPatch {
  recs: SvgReviewRec[];
}

export type SvgReviewApplier = (patch: SvgReviewPatch) => Promise<boolean>;

let live: SvgReviewApplier | null = null;

/** A mounted Generate SVG panel claims the apply path; unmount releases it. */
export function bindSvgReviewApplier(apply: SvgReviewApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/** Apply a review change. False means "nothing changed" — never a partial write. */
export async function applySvgReviewPatch(patch: SvgReviewPatch): Promise<boolean> {
  if (live) return live(patch);
  return applyToFiles(patch);
}

async function applyToFiles(patch: SvgReviewPatch): Promise<boolean> {
  const root = (await loadHandles(SVG_HANDLE_KEY))?.source ?? null;
  if (!root) return false;
  const index = loadSourceIndex();
  let changed = false;
  for (const rec of patch.recs) {
    const entry = index.get(rec.id);
    if (!entry) continue;
    changed = (await patchOne(root, entry, rec)) || changed;
  }
  return changed;
}

async function patchOne(root: DirHandleLike, entry: IndexEntry, rec: SvgReviewRec): Promise<boolean> {
  const relPath = metaPathOfEntry(entry);
  if (relPath === "") return false;
  const read = await loadMetaAt(root, relPath);
  const meta = read.meta ?? metaFromIndex(entry, rec);
  const version = meta.versions.find((v) => v.version === rec.version);
  if (!version || version.review === rec.review) return false;
  await saveMetaAt(root, relPath, withVersion(meta, { ...version, review: rec.review }));
  return true;
}

/** A pair file rebuilt from the index when the real one is gone or unreadable. */
function metaFromIndex(entry: IndexEntry, rec: SvgReviewRec): PairMeta {
  return metaFromRecord({
    pair_id: rec.id, source: null, ai_result: entry.relPath,
    decision: "pending", reviewed_at: new Date(0).toISOString(),
  });
}

/** The review status a version carries right now (a history entry's `before`). */
export async function currentReview(root: DirHandleLike, source: { id: string }, version: number): Promise<ReviewStatus | null> {
  const entry = loadSourceIndex().get(source.id);
  if (!entry) return null;
  const read = await loadMetaAt(root, metaPathOfEntry(entry));
  const found = read.meta?.versions.find((v) => v.version === version);
  return found ? found.review : null;
}

export type { PairMeta };
