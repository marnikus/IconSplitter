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

/**
 * A bar that reached 100% is finished, whatever the run is still doing in the
 * background: the files are up, so Cancel is pointless and a close control is
 * what the header needs. `complete` marks the run itself as returned.
 */
export function uploadBar(step: UploadProgressStep): UploadBar {
  const total = Math.max(1, step.total);
  const done = Math.max(0, Math.min(step.done, step.total));
  const percent = Math.min(100, Math.round((done / total) * 100));
  const failed = (step.failed ?? 0) > 0;
  const finished = step.complete === true || done >= step.total;
  return {
    percent: finished ? 100 : percent,
    finished,
    failed,
    title: finished && step.complete === true
      ? (failed ? "Upload finished with errors" : "Upload complete")
      : finished ? "Upload complete" : "Uploading to stock sites",
    detail: step.label,
    done,
    total: step.total,
    remaining: Math.max(0, step.total - done),
  };
}
