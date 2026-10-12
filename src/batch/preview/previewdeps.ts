// previewdeps.ts — what one previewed row needs, and the real implementation of it
// (design D8/D9/RULE 8). The session hook takes this by injection so the UI tests
// can drive the REAL queue/cache/state machine with deterministic work, while the
// live path below reads pixels through the shipped pipeline: planSplit (the same
// analyze+detect the split uses) and renderIcon at thumb size. Read-only: one file
// handle, one image, no writable anywhere in sight (I-67).

import { loadImageFile } from "../../lib/dom";
import { resolveFileAt, type DirHandleLike } from "../../lib/fs";
import { planSplit } from "../../lib/batchsplit";
import { stripBlobs } from "../../lib/previewstrip";
import type { SplitSettings } from "../../lib/presets";
import type { QueueToken, RowResult } from "../../lib/previewqueue";

export interface StripResult {
  /** One PNG per chunk canvas, left to right. */
  blobs: Blob[];
  /** Icons the row has at this merge distance. */
  count: number;
  usedFrac: number;
}

export interface StripJob {
  root: DirHandleLike | null;
  relPath: string;
  split: SplitSettings;
  token: QueueToken;
}

export interface PreviewDeps {
  /** Reads one row and returns its strip. Must not write anything (I-67). */
  work(job: StripJob): Promise<RowResult<StripResult>>;
  /** Cooperative pause between rows; overridable so tests stay deterministic. */
  pause?: () => Promise<void>;
}

/** The live row reader: read → analyze+detect → render icons → encode chunks. */
export async function readStrip(job: StripJob): Promise<RowResult<StripResult>> {
  if (!job.root) return { kind: "error", message: "No folder is open" };
  const handle = await resolveFileAt(job.root, job.relPath);
  const img = await loadImageFile(await handle.getFile());
  const plan = planSplit(img, job.split);
  if (plan.boxes.length === 0) return { kind: "empty" };
  const blobs = await stripBlobs(img, plan, job.split);
  return { kind: "ok", value: { blobs, count: plan.boxes.length, usedFrac: plan.usedFrac } };
}

/**
 * The deps the Batch tab runs with in the app (tests inject their own).
 *
 * ONE frozen object for the whole app on purpose: the session hook keys its session
 * on this value, so handing it a fresh object per render used to rebuild (and close)
 * the session on every render — every strip URL revoked before it could paint, the
 * plan restarted four times a second, and Stop only ever stopping a session that was
 * already being replaced (2026-10-12). Stable identity is part of the contract.
 */
export const LIVE_PREVIEW_DEPS: PreviewDeps = Object.freeze({ work: readStrip }) as PreviewDeps;
