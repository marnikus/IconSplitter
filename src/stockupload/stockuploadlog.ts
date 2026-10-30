// stockuploadlog.ts — the "Stock upload" tab's log vocabulary.
//
// The tab has no log of its own: the shell's docked log is the one activity log,
// and this module is its only writer. Every entry names the file (or the target)
// and the outcome, and the returned spec has NO `data` field — no metadata text,
// no credentials, no image bytes can travel. The live counters stay on the
// panel's progress line; the log keeps the trail of what actually happened.

import type { LogSpec } from "../lib/log";

export const STOCKUPLOAD_FEATURE = "stockupload";

/** The CLOSED set of actions the tab may emit, in one place for the lock test. */
export const STOCKUPLOAD_LOG_ACTIONS = [
  "run-started", "uploaded", "failed", "page-reloaded", "batch-submitted", "batch-ready", "run-finished",
] as const;

export type StockUploadLogAction = (typeof STOCKUPLOAD_LOG_ACTIONS)[number];

/** A spec with no data field: everything worth saying is in `detail`. */
export type StockUploadLogSpec = Omit<LogSpec, "data" | "feature" | "action"> & {
  feature: typeof STOCKUPLOAD_FEATURE;
  action: StockUploadLogAction;
};

/** The run is starting: how many files, to which sites. */
export function runStartedSpec(input: { targets: readonly string[]; files: number }): StockUploadLogSpec {
  const where = input.targets.length > 0 ? ` to ${input.targets.join(", ")}` : "";
  return {
    level: "info", feature: STOCKUPLOAD_FEATURE, action: "run-started",
    ids: { files: input.files },
    detail: `upload started: ${input.files} file(s)${where}`,
  };
}

/** One file Getty (or the FTPS/SFTP site) took. */
export function uploadedSpec(input: { target: string; file: string }): StockUploadLogSpec {
  return {
    level: "info", feature: STOCKUPLOAD_FEATURE, action: "uploaded",
    ids: { target: input.target, file: input.file },
    detail: `${input.target} · ${input.file} uploaded`,
  };
}

/** One file did not upload, with the reason — never a silent counter. */
export function failedSpec(input: { target: string; file: string; reason: string }): StockUploadLogSpec {
  return {
    level: "error", feature: STOCKUPLOAD_FEATURE, action: "failed",
    ids: { target: input.target, file: input.file },
    detail: `${input.target} · ${input.file} failed — ${input.reason}`,
  };
}

/** The page had to be reloaded to get the upload moving again. */
export function pageReloadedSpec(input: { target: string; reloads: number }): StockUploadLogSpec {
  return {
    level: "warn", feature: STOCKUPLOAD_FEATURE, action: "page-reloaded",
    ids: { target: input.target, reloads: input.reloads },
    detail: `${input.target}: no progress for 30 s — page reloaded (${input.reloads})`,
  };
}

/** Getty accepted the batch; the icons are submitted. */
export function batchSubmittedSpec(target: string): StockUploadLogSpec {
  return {
    level: "info", feature: STOCKUPLOAD_FEATURE, action: "batch-submitted",
    ids: { target }, detail: `${target}: batch submitted`,
  };
}

/**
 * Getty has no Complete/Submit control on this batch and every file carries its
 * "Ready to submit" icon — the run is finished, so this is an info line, not an
 * error on a job that was actually done.
 */
export function batchReadySpec(input: { target: string; files: number }): StockUploadLogSpec {
  return {
    level: "info", feature: STOCKUPLOAD_FEATURE, action: "batch-ready",
    ids: { target: input.target, files: input.files },
    detail: `${input.target}: ${input.files} file(s) ready to submit — Getty has no Complete button on this batch`,
  };
}

/** One line for the whole run: counts first, the run's error after it. */
export function runFinishedSpec(summary: {
  uploaded: number; failed: number; cancelled: boolean; lastError: string | null;
}): StockUploadLogSpec {
  const head = summary.cancelled
    ? `stopped after ${summary.uploaded} file(s) uploaded, ${summary.failed} failed`
    : `${summary.uploaded} file(s) uploaded, ${summary.failed} failed`;
  const level = summary.cancelled ? "warn" : summary.failed > 0 || summary.lastError !== null ? "error" : "info";
  return {
    level, feature: STOCKUPLOAD_FEATURE, action: "run-finished",
    ids: { uploaded: summary.uploaded, failed: summary.failed },
    detail: summary.lastError === null ? head : `${head} — ${summary.lastError}`,
  };
}

/** 1 when a poll saw the helper reload the page since the last one, else null. */
export function reloadNoteOf(previous: number, current: number): number | null {
  return current > previous ? current : null;
}
