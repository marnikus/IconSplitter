// reviewundo.ts — how an SVG review decision reaches its store when the
// Generate SVG panel is not mounted (RULE 12, design doc §3).
// A decision lives in the per-file sidecar beside the AI image, so the
// cross-tab path reads the remembered root handle, patches the sidecars a
// history entry names, and writes them back. A mounted panel binds itself here
// first, so a click and an undo both land in the same code path.

import { loadHandles } from "../batch/store";
import { withVersion, type ReviewStatus, type SvgSidecar } from "../lib/svgfile";
import { loadSidecar, saveSidecar } from "./sidecar";
import { loadSourceIndex, sourceFromIndex } from "./sourceindex";
import type { DirHandleLike } from "../lib/fs";

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
    changed = (await patchOne(root, sourceFromIndex(entry), rec)) || changed;
  }
  return changed;
}

async function patchOne(root: DirHandleLike, source: ReturnType<typeof sourceFromIndex>, rec: SvgReviewRec): Promise<boolean> {
  const load = await loadSidecar(root, source);
  const version = load.sidecar?.versions.find((v) => v.version === rec.version);
  if (!load.sidecar || !version || version.review === rec.review) return false;
  await saveSidecar(root, source, withVersion(load.sidecar, { ...version, review: rec.review }));
  return true;
}

/** The review status a version carries right now (a history entry's `before`). */
export async function currentReview(root: DirHandleLike, source: { id: string }, version: number): Promise<ReviewStatus | null> {
  const entry = loadSourceIndex().get(source.id);
  if (!entry) return null;
  const load = await loadSidecar(root, sourceFromIndex(entry));
  const found = load.sidecar?.versions.find((v) => v.version === version);
  return found ? found.review : null;
}

export type { SvgSidecar };
