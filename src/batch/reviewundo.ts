// reviewundo.ts — the batch split-review decision's undo path (RULE 12).
// A review lives in the pair's own <base>.json beside the images, so undo
// rewrites exactly those files. A mounted BatchPanel binds itself as the live
// applier first (a click and an undo share ONE code path); the fallback works
// from the remembered preset handles when no panel is mounted.

import { loadLastName, loadHandles } from "./store";
import { parseState, serializeState } from "../lib/statefile";
import { isReview, type ReviewStatus } from "../lib/reviewstatus";
import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { Outcome } from "./statewrite";

/** One decision a history entry carries: which row, in which group, to what. */
export interface BatchReviewRec {
  relPath: string;
  dirPath: string;
  base: string;
  review: ReviewStatus;
}

export interface BatchReviewPatch {
  recs: BatchReviewRec[];
}

export type BatchReviewApplier = (patch: BatchReviewPatch) => Promise<boolean>;

let live: BatchReviewApplier | null = null;

/** A mounted Batch folders panel claims the apply path; unmount releases it. */
export function bindBatchReviewApplier(apply: BatchReviewApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/** Apply a review change. False means "nothing changed" — never a partial write. */
export async function applyBatchReviewPatch(patch: BatchReviewPatch): Promise<boolean> {
  const recs = validRecs(patch);
  if (recs.length === 0) return false;
  if (live) return live({ recs });
  return applyToFiles(recs);
}

function validRecs(patch: BatchReviewPatch): BatchReviewRec[] {
  return patch.recs.filter((r) => typeof r.relPath === "string" && isReview(r.review));
}

/** The panel-less path: rewrite the named <base>.json files from the handles. */
async function applyToFiles(recs: BatchReviewRec[]): Promise<boolean> {
  const root = (await loadHandles(loadLastName() ?? ""))?.source ?? null;
  if (!root) return false;
  let changed = false;
  for (const rec of recs) changed = (await patchOne(root, rec)) || changed;
  return changed;
}

async function patchOne(root: DirHandleLike, rec: BatchReviewRec): Promise<boolean> {
  const dir = rec.dirPath === "" ? root : await probePath(root, rec.dirPath);
  if (!dir) return false;
  const fh = await tryGetFile(dir, `${rec.base}.json`);
  if (!fh) return false;
  const prev = parseState(await (await fh.getFile()).text());
  if (!prev) return false; // unreadable payload is never patched (RULE 13)
  const sources = prev.sources.map((r) => (r.relPath === rec.relPath && r.review !== rec.review ? { ...r, review: rec.review } : r));
  if (sources === prev.sources) return false;
  await writeFileOverwrite(dir, `${rec.base}.json`, new Blob([serializeState({ ...prev, sources })], { type: "application/json" }));
  return true;
}

/** The shared write the click and the undo both use through the live applier. */
export function reviewOutcomes(recs: BatchReviewRec[]): Outcome[] {
  return recs.map((r) => ({ dirPath: r.dirPath, base: r.base, relPath: r.relPath, review: r.review }));
}
