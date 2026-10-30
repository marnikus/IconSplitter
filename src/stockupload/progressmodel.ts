// progressmodel.ts — what the cross-tab upload bar shows. One step of the run's
// progress line becomes a bar state: a running bar, or a finished one that is
// marked done at 100% and can be closed. Pure, so the display rules are testable
// without mounting the panel's whole hook.

import type { UploadProgressStep } from "./batchtypes";

export interface UploadBar {
  /** Percentage shown on the bar; 100 as soon as every file is settled. */
  percent: number;
  /** Counted as done: every file is up, or the run has returned. */
  finished: boolean;
  /** The run ended with at least one file that did not upload. */
  failed: boolean;
  title: string;
  detail: string;
  done: number;
  total: number;
  remaining: number;
}

function titleOf(step: UploadProgressStep, finished: boolean, failed: boolean, done: number): string {
  if (step.complete === true) {
    if (!failed) return "Upload complete";
    // Nothing landed: saying "finished with errors" over a full bar still reads
    // like a success, so a run that uploaded no file says exactly that.
    return done === 0 ? "Upload failed — nothing was uploaded" : "Upload finished with errors";
  }
  // A full upload phase only means the bytes are in: the run still has to save
  // metadata and see Getty mark each card "Ready to submit", so it is not done.
  if (!finished) return step.phase === "verifying" ? "Verifying Ready to submit" : "Uploading to stock sites";
  return "Upload complete";
}

/**
 * A bar is finished when the run has returned, or when the **verification**
 * count reached the total — never merely because the files were uploaded. A
 * finished bar forces 100 %, drops Cancel and offers the ✕ close.
 */
export function uploadBar(step: UploadProgressStep): UploadBar {
  const total = Math.max(1, step.total);
  const done = Math.max(0, Math.min(step.done, step.total));
  const percent = Math.min(100, Math.round((done / total) * 100));
  const failed = (step.failed ?? 0) > 0;
  const finished = step.complete === true || (done >= step.total && step.phase !== "uploading");
  return {
    // 100 % is only for a run that really uploaded every file: a failed run keeps
    // the honest ratio it earned (0 uploaded of 418 is 0 %, not 100 %).
    percent: finished && !failed ? 100 : percent,
    finished,
    failed,
    title: titleOf(step, finished, failed, done),
    detail: step.label,
    done,
    total: step.total,
    remaining: Math.max(0, step.total - done),
  };
}
