import { armCompletionSound } from "../ui/completionSound";
// downloadactions.ts — "Download all" (2026-10-08, design
// docs/archive/2026-10-08-upload-download-all/design.md): the selection's
// committed packages copied into ONE folder the user picks. The plan comes from
// the pure planner (lib/upload/download); this module owns the I/O: the
// browser's folder picker (a destination, not a root — nothing captured,
// nothing remembered), one verified write per file (read back, compared —
// RULE 23), never an overwrite, one file's failure never stopping the next
// (RULE 5), and the one honest line at the end (toast + log).

import { useCallback, useRef } from "react";
import { pickDirectory } from "../batch/picker";
import { nameExists, readBytesAt, writeFileNew, type DirHandleLike } from "../lib/fs";
import { downloadLine, planDownload, type DownloadItem, type DownloadPlan, type DownloadResult } from "../lib/upload/download";
import { verifyEpsDocument } from "../lib/upload/eps";
import { log } from "../log/logstore";
import { downloadedSpec } from "./uploadlog";
import { startUploadProgress } from "./processprogress";
import type { ProcessReporter, ProcessStatus } from "../lib/processprogress";
import type { Latest } from "./types";
import type { UploadActions, UploadCtx } from "./actions";

type DownloadSlice = Pick<UploadActions, "downloadSelected" | "cancelDownload">;

export function useDownloadActions(ctx: UploadCtx): DownloadSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const active = useRef<AbortController | null>(null);
  const downloadSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = downloadGuard(c, ids);
    if (why !== null) return c.say(why, true);
    if (active.current !== null) return c.say("A download is already in flight", true);
    const abort = new AbortController();
    active.current = abort;
    void downloadTo(latest, ids, abort.signal).finally(() => { active.current = null; });
  }, [latest]);
  const cancelDownload = useCallback(() => active.current?.abort(), []);
  return { downloadSelected, cancelDownload };
}

/** The files the selection would download right now — what the button counts. */
export function downloadPlanOf(c: Pick<UploadCtx, "rows">, ids: string[]): DownloadPlan {
  const picked = new Set(ids);
  return planDownload(c.rows.filter((r) => picked.has(r.source.id)).map((r) => ({ id: r.source.id, base: r.source.base, record: r.record })));
}

function downloadGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.busy !== null) return "Wait for the current step to finish";
  return null;
}

/** Pick the destination with a reserved run and a captured source/selection. */
async function downloadTo(latest: Latest, ids: string[], signal: AbortSignal): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike;
  const plan = downloadPlanOf(c, ids);
  armCompletionSound();
  c.setBusy("Choosing download folder…");
  try {
    const dest = await pickDirectory();
    if (dest === null) return c.say("No folder chosen — nothing was saved");
    await runDownload({ latest, root, dest, plan, signal });
  } catch {
    latest.current.say("Download stopped unexpectedly — verified copies are kept", true);
  } finally {
    latest.current.setBusy(null);
  }
}

interface DownloadRun {
  latest: Latest;
  root: DirHandleLike;
  dest: DirHandleLike;
  plan: DownloadPlan;
  signal: AbortSignal;
}
const EMPTY_RESULT: DownloadResult = { saved: 0, icons: 0, kept: 0, missing: 0, failed: 0, notExported: 0 };

/** One retained progress summary and one sound, never on a cancelled picker/no-op. */
async function runDownload(run: DownloadRun): Promise<void> {
  if (run.plan.items.length === 0) return publishDownload(run, { ...EMPTY_RESULT, notExported: run.plan.notExported });
  const progress = startUploadProgress(run.latest.current, "download", run.plan.items.length);
  let status: Exclude<ProcessStatus, "running"> = "failed";
  try {
    const result = await copyPlanned(run, progress);
    status = run.signal.aborted ? "cancelled" : result.failed + result.missing > 0 ? "failed" : "completed";
    publishDownload(run, result);
  } finally {
    progress.finish(status);
  }
}

function publishDownload(run: DownloadRun, result: DownloadResult): void {
  const line = `${run.signal.aborted ? "Download cancelled — " : ""}${downloadLine(result, run.dest.name)}`;
  log(downloadedSpec({ line, failed: result.failed }));
  run.latest.current.say(line, result.failed + result.missing > 0);
}

/** Sequential isolated copies: cancel blocks the next file, never an active verification. */
async function copyPlanned(run: DownloadRun, progress: ProcessReporter): Promise<DownloadResult> {
  const result = { ...EMPTY_RESULT, notExported: run.plan.notExported };
  const savedIcons = new Set<string>();
  for (const item of run.plan.items) {
    if (run.signal.aborted) break;
    run.latest.current.setBusy(`Downloading ${item.to}…`);
    const outcome = await copyOne(run.root, run.dest, item);
    result[outcome] += 1;
    if (outcome === "saved") savedIcons.add(item.id);
    progress.advance();
  }
  result.icons = savedIcons.size;
  return result;
}

/** One file: read, refuse to overwrite, write, read back and compare. */
export async function copyOne(root: DirHandleLike, dest: DirHandleLike, item: DownloadItem): Promise<"saved" | "kept" | "missing" | "failed"> {
  const bytes = await readBytesAt(root, item.from);
  if (bytes === null) return "missing";
  if (item.to.toLowerCase().endsWith(".eps") && !verifyEpsDocument(new TextDecoder().decode(bytes)).ok) return "failed";
  if (await nameExists("file", dest, item.to)) return "kept";
  try {
    await writeFileNew(dest, item.to, new Blob([bytes as BlobPart]));
    const back = await readBytesAt(dest, item.to);
    if (back !== null && sameBytes(back, bytes)) return "saved";
    await dest.removeEntry?.(item.to);
    return "failed";
  } catch {
    return "failed";
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
