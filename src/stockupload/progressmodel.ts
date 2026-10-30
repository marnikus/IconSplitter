// progressmodel.ts — what the cross-tab upload bar shows. One step of the run's
// progress line becomes a bar state: a running bar, or a finished one that the
// run returned. Pure, so the display rules are testable without mounting the
// panel's whole hook.
//
// Honesty rules (2026-10-30):
//   - `done` counts verified outcomes only (`ready + failed`), never arrival;
//   - a bar is finished when the *run* returned, not when a count reached its
//     total, so 100 % can never be shown mid-flight;
//   - a failure is named on the bar from the moment it exists, and a finished
//     run that left files pending/unverified never reads "Upload complete".

import type { UploadProgressStep } from "./batchtypes";

export interface UploadBar {
  /** Percentage shown on the bar; 100 only once the run returned. */
  percent: number;
  /** The run returned (or the user cancelled it). */
  finished: boolean;
  /** The run ended with at least one file that did not upload. */
  failed: boolean;
  title: string;
  detail: string;
  done: number;
  total: number;
  remaining: number;
}

interface TitleState {
  finished: boolean;
  failed: number;
  pending: number;
  unverified: number;
  cancelled: boolean;
}

function finishedTitle(s: TitleState): string {
  if (s.cancelled) return "Upload cancelled";
  if (s.failed > 0) return `Upload finished with ${s.failed} failed`;
  if (s.pending > 0) return `Upload finished — ${s.pending} not ready to submit`;
  if (s.unverified > 0) return `Upload finished — ${s.unverified} not verified`;
  return "Upload complete";
}

function barTitle(s: TitleState): string {
  if (s.finished) return finishedTitle(s);
  return s.failed > 0 ? `Uploading to stock sites — ${s.failed} failed` : "Uploading to stock sites";
}

/** A bar state that cannot claim more than the run actually verified. */
export function uploadBar(step: UploadProgressStep): UploadBar {
  const total = Math.max(1, step.total);
  const done = Math.max(0, Math.min(step.done, step.total));
  const failed = Math.max(0, step.failed ?? 0);
  const pending = Math.max(0, step.pending ?? 0);
  const unverified = Math.max(0, step.unverified ?? 0);
  const finished = step.complete === true;
  // A running (or cancelled) bar stops at 99 %: the last percent belongs to a
  // run that returned with every file verified.
  const counted = Math.min(99, Math.round((done / total) * 100));
  const percent = finished && step.cancelled !== true ? 100 : counted;
  return {
    percent, finished, failed: failed > 0,
    title: barTitle({ finished, failed, pending, unverified, cancelled: step.cancelled === true }),
    detail: step.label,
    done, total: step.total, remaining: Math.max(0, step.total - done),
  };
}
