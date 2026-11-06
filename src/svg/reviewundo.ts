// reviewundo.ts — the SVG review decision's cross-tab path (RULE 12, I-41).
// A version's review lives in the pair's OWN file beside the images, so this
// module reads the remembered root handle, finds the pair file from the source
// index (id -> AI image path) and writes the version back. A mounted Generate
// SVG panel binds itself here first, so a click and an undo both land in the
// same code path.
//
// Remove in SVG to upload / Upload (2026-11-06) declines an item from another
// tab: its record names WHERE the pair file is (`at`: that tab's remembered
// folder + the path), so the write lands even when Generate SVG never listed
// it. Every applied change is announced (`onSvgReviewsWritten`) so each list
// follows a click, an undo and a redo the same way.

import { loadHandles } from "../batch/store";
import { withReview, type PairMeta } from "../lib/pairmeta";
import type { ReviewStatus } from "../lib/svgmodel";
import type { DirHandleLike } from "../lib/fs";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { metaFromRecord } from "../selection/pairrecord";
import { loadSourceIndex, metaPathOfEntry, type IndexEntry } from "../state/sourceindex";

export { SVG_HANDLE_KEY } from "../state/handlekeys";
import { SVG_HANDLE_KEY } from "../state/handlekeys";

/**
 * One decision a history entry carries: which source, and the ITEM status it
 * had (2026-10-20). No version: the status covers the whole row.
 */
export interface SvgReviewRec {
  id: string;
  review: ReviewStatus;
  /** Where the pair file is, when the decision comes from another tab's list. */
  at?: ReviewAt;
}

/** A tab's remembered folder (its handle key) and the pair file's path in it. */
export interface ReviewAt {
  handleKey: string;
  metaPath: string;
}

type ReviewListener = (recs: readonly SvgReviewRec[]) => void;
const listeners = new Set<ReviewListener>();

/** Every list that shows items by their Generate SVG decision follows this. */
export function onSvgReviewsWritten(fn: ReviewListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Tells every list which item decisions just reached their files. */
export function announceSvgReviews(recs: readonly SvgReviewRec[]): void {
  if (recs.length === 0) return;
  for (const fn of [...listeners]) fn(recs);
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
  const changed = live ? await live(patch) : await writeReviewsToFiles(patch.recs);
  if (changed) announceSvgReviews(patch.recs);
  return changed;
}

/** Writes each decision straight into its pair file (no list involved). */
export async function writeReviewsToFiles(recs: readonly SvgReviewRec[]): Promise<boolean> {
  let changed = false;
  for (const rec of recs) {
    const place = await placeOf(rec);
    if (place !== null) changed = (await patchOne(place, rec)) || changed;
  }
  return changed;
}

/** A pair file to write: the folder, the path, and the record to rebuild if it is gone. */
interface Place { root: DirHandleLike; relPath: string; rebuild: PairMeta | null }

/** The record's own place first; else Generate SVG's folder through the source index. */
async function placeOf(rec: SvgReviewRec): Promise<Place | null> {
  if (isAt(rec.at)) {
    const root = (await loadHandles(rec.at.handleKey))?.source ?? null;
    return root === null ? null : { root, relPath: rec.at.metaPath, rebuild: null };
  }
  const root = (await loadHandles(SVG_HANDLE_KEY))?.source ?? null;
  const entry = loadSourceIndex().get(rec.id);
  if (root === null || entry === undefined) return null;
  const relPath = metaPathOfEntry(entry);
  return relPath === "" ? null : { root, relPath, rebuild: metaFromIndex(entry, rec) };
}

/** History payloads are validated on use (RULE 13). */
function isAt(at: unknown): at is ReviewAt {
  const v = at as Partial<ReviewAt> | null | undefined;
  return typeof v?.handleKey === "string" && typeof v.metaPath === "string" && v.metaPath !== "";
}

async function patchOne(place: Place, rec: SvgReviewRec): Promise<boolean> {
  const meta = (await loadMetaAt(place.root, place.relPath)).meta ?? place.rebuild;
  if (meta === null || meta.review === rec.review) return false;
  await saveMetaAt(place.root, place.relPath, withReview(meta, rec.review));
  return true;
}

/** A pair file rebuilt from the index when the real one is gone or unreadable. */
function metaFromIndex(entry: IndexEntry, rec: SvgReviewRec): PairMeta {
  return metaFromRecord({
    pair_id: rec.id, source: null, ai_result: entry.relPath,
    decision: "pending", reviewed_at: new Date(0).toISOString(),
  });
}

/** The item's review status right now (a history entry's `before`). */
export async function currentReview(root: DirHandleLike, source: { id: string }): Promise<ReviewStatus | null> {
  const entry = loadSourceIndex().get(source.id);
  if (!entry) return null;
  const read = await loadMetaAt(root, metaPathOfEntry(entry));
  return read.meta ? read.meta.review : null;
}

export type { PairMeta };
