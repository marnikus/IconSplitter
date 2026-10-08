// downloadactions.ts — "Download all" on the SVG to upload tab (2026-10-08).
// The bulk bar's button saves the CHECKED icons' finished packages (SVG, JPG and
// EPS when the package has one) into one folder the user picks in the native
// dialog. It exports nothing and pays for nothing: only what already exists on
// disk and proves itself is written. The dialog opens only once there is
// something to save, so a click that cannot succeed never shows one.

import { useCallback, useRef } from "react";
import { pickDirectory } from "../batch/picker";
import type { DirHandleLike } from "../lib/fs";
import {
  nothingReadyPhrase, planDownload, summarizeDownload,
  type DownloadPlan, type DownloadRunResult, type DownloadSubject,
} from "../lib/upload/download";
import { log } from "../log/logstore";
import type { UploadActions, UploadCtx } from "./actions";
import { runDownload } from "./downloadrun";
import type { Latest, UploadRow } from "./types";
import { downloadedSpec } from "./uploadlog";

type DownloadSlice = Pick<UploadActions, "downloadSelected" | "cancelDownload">;

export function useDownloadActions(ctx: UploadCtx): DownloadSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const downloadSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = downloadGuard(c, ids);
    if (why !== null) return c.say(why, true);
    const plan = planDownload(subjectsOf(c.rows), ids);
    if (plan.icons.length === 0) return c.say(nothingReadyPhrase(plan), true);
    void runDownloadBatch(latest, plan);
  }, [latest]);
  const cancelDownload = useCallback(() => {
    const c = latest.current;
    if (c.refs.abortDownload.current === null) return;
    c.refs.abortDownload.current.abort();
    c.say("Cancelling — files already saved are kept");
  }, [latest]);
  return { downloadSelected, cancelDownload };
}

/** How many checked icons have a finished package to save: the count on the button. */
export function downloadReadyCount(rows: readonly UploadRow[], checked: readonly string[]): number {
  return planDownload(subjectsOf(rows), checked).icons.length;
}

/** Why a download cannot start right now, or null when it can. */
function downloadGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.runningDownload > 0) return "A download is already in flight — cancel it or wait";
  return null;
}

/**
 * One download. The folder dialog opens FIRST, synchronously inside the click
 * (no await before it), so the browser counts it as the user's own gesture; then
 * the plan runs; then the outcome is said and logged once. A dismissed dialog
 * changes nothing.
 */
async function runDownloadBatch(latest: Latest, plan: DownloadPlan): Promise<void> {
  const dest = await pickDirectory();
  const c = latest.current;
  if (dest === null) return c.say("Download cancelled — no folder was chosen, nothing was saved");
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return c.say("Open a folder first", true);
  const abort = new AbortController();
  c.refs.abortDownload.current = abort;
  c.dispatch({ type: "running", kind: "download", n: plan.icons.length });
  const run = await runDownload({
    root, dest, icons: plan.icons, signal: abort.signal,
    onProgress: (index, total, name) => {
      c.dispatch({ type: "progress", progress: { done: index, total } });
      c.setBusy(`Saving ${index + 1} of ${total} · ${name}…`);
    },
  });
  finishDownload(c, plan, run, dest.name);
}

/** The end of a run, whatever its outcome: state cleared, the sentence said, the one log entry written. */
function finishDownload(c: UploadCtx, plan: DownloadPlan, run: DownloadRunResult, folder: string): void {
  c.refs.abortDownload.current = null;
  c.dispatch({ type: "running", kind: "download", n: 0 });
  c.dispatch({ type: "progress", progress: null });
  c.setBusy(null);
  const summary = summarizeDownload(folder, plan, run);
  log(downloadedSpec({
    saved: run.saved, icons: run.savedIcons, skipped: plan.skipped.length, failed: run.failures.length,
    missing: run.missing, stopped: run.stopped, detail: summary,
  }));
  c.say(summary, run.saved === 0 || run.failures.length > 0);
}

/** The row, reduced to what a download reads: a run in flight, the status, the record. */
function subjectsOf(rows: readonly UploadRow[]): DownloadSubject[] {
  return rows.map((row) => ({
    id: row.source.id, svgName: row.source.svgName, status: row.status,
    stale: row.stale, running: row.running !== null, record: row.record,
  }));
}
