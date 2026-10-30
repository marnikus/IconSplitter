// gettywebtransfer.ts — the whole run in **one** call into the loopback helper's
// Getty web session: read each icon's JPEG (+ optional EPS), apply the
// in-memory title/description copy when enabled, and let the contributor page's
// own uploader take all pairs at once.

import { readBytesAt, type DirHandleLike } from "../lib/fs";
import {
  gettyWebFileOrder, gettyWebMetadataOf, gettyWebStem, validateGettyWebTasks,
} from "../lib/stockupload/gettyweb";
import { gettyWebProgress, type GettyWebProgress } from "../lib/stockupload/gettyprogress";
import {
  uploadBridgeGettyWeb, type GettyWebFile, type GettyWebIcon, type GettyWebRejection,
  type GettyWebResult, type GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, SkippedFormat } from "../lib/stockupload/plan";
import { prepareMetadataCopy } from "../lib/stockupload/sendmeta";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";

/** One icon of the run: the tasks the plan gives it and the row it came from. */
export interface GettyWebIconInput {
  tasks: PlannedTransfer[];
  missing: readonly SkippedFormat[];
  item?: ExportedItem;
}

export interface GettyWebRunInput {
  icons: readonly GettyWebIconInput[];
  root: DirHandleLike;
  target: StockFtpPreset;
  creds: FtpCredentials;
  combine: boolean;
  batchName: string;
  submissionType: string;
  sessionKey: string;
  bridgeUrl: string;
  signal: AbortSignal;
  uploadFn?: (input: GettyWebUploadInput) => Promise<GettyWebResult>;
}

/** What one icon of the run is worth: uploaded, or the reason it is not. */
export interface GettyWebIconOutcome {
  ok: boolean;
  reason: string;
}

export interface GettyWebRunOutcome {
  ok: boolean;
  /** Non-empty when an icon (or the whole call) did not upload. */
  reason: string;
  icons: GettyWebIconOutcome[];
  /** Set on success: the batch is only filled, the run submits it at the end. */
  deferCompletion?: boolean;
}

function failed(input: GettyWebRunInput, reason: string): GettyWebRunOutcome {
  return { ok: false, reason, icons: input.icons.map(() => ({ ok: false, reason })) };
}

/** Reads one icon's pair from disk; null when a file vanished since the plan. */
async function readIcon(input: GettyWebRunInput, icon: GettyWebIconInput): Promise<GettyWebFile[] | null> {
  const files: GettyWebFile[] = [];
  for (const task of gettyWebFileOrder(icon.tasks)) {
    const bytes = task.relPath ? await readBytesAt(input.root, task.relPath) : null;
    if (!bytes?.byteLength) return null;
    files.push({ name: task.fileName, bytes });
  }
  return files;
}

/** Applies the upload-only "Title + description" copy to one icon's files. */
async function combined(input: GettyWebRunInput, files: GettyWebFile[], item?: ExportedItem): Promise<GettyWebFile[] | string> {
  if (!input.combine) return files;
  if (!item) return "Item no longer present";
  try {
    const copies = [];
    for (const file of files) copies.push({ name: file.name, bytes: await prepareMetadataCopy(item, file.name, file.bytes) });
    return copies;
  } catch (err) {
    return (err as Error).message || "Could not prepare upload metadata";
  }
}

/** Reads and prepares every icon before anything is sent. */
async function prepareIcons(input: GettyWebRunInput): Promise<GettyWebIcon[] | string> {
  const prepared: GettyWebIcon[] = [];
  for (const icon of input.icons) {
    const invalid = validateGettyWebTasks(icon.tasks, icon.missing);
    if (invalid !== null) return invalid;
    const read = await readIcon(input, icon);
    if (!read) return "Getty illustration file could not be read.";
    const files = await combined(input, read, icon.item);
    if (typeof files === "string") return files;
    prepared.push({ files, metadata: icon.item ? gettyWebMetadataOf(icon.item) : null });
  }
  return prepared;
}

/**
 * Only a card carrying Getty's own "Ready to submit" icon proves the file was
 * uploaded; a card reading "Upload failed" is named as such, and anything else is
 * not claimed as uploaded. A thumbnail proves nothing.
 */
function outcomeOf(
  icon: GettyWebIconInput, res: { accepted: readonly string[]; failed: readonly GettyWebRejection[]; notReady: readonly string[] },
): GettyWebIconOutcome {
  const stems = gettyWebFileOrder(icon.tasks).map((task) => gettyWebStem(task.fileName));
  const stemOf = (name: string) => gettyWebStem(name);
  const rejected = res.failed.find((entry) => stems.includes(stemOf(entry.name)));
  if (rejected) {
    const id = rejected.id ? ` (${rejected.id})` : "";
    return { ok: false, reason: `Getty reports "Upload failed" for ${rejected.name}${id}` };
  }
  if (res.accepted.some((name) => stems.includes(stemOf(name)))) return { ok: true, reason: "" };
  // Getty has the bytes but has not validated the card: that is not an upload.
  const unvalidated = res.notReady.find((name) => stems.includes(stemOf(name)));
  if (unvalidated) {
    return { ok: false, reason: `Getty does not show its "Ready to submit" icon for ${unvalidated} — not counted as uploaded` };
  }
  return { ok: false, reason: `Getty does not show its "Ready to submit" icon for ${stems[0] ?? "this icon"} — not counted as uploaded` };
}

const GETTY_WEB_NOT_COMPLETED_NOTE =
  "files uploaded but the batch was not completed — submit it on the Getty contributor page";

/**
 * A Getty web upload that uploaded but stopped before Complete needs a manual
 * finish. Per-file work defers completion on purpose (`deferCompletion`), so
 * this only speaks for the single finish call at the end of the run. A batch
 * whose every card carries Getty's "Ready to submit" icon is finished too: the
 * page simply had no Complete/Submit control to click.
 */
export function completionNote(
  res: { ok: boolean; completed?: boolean; deferCompletion?: boolean; ready?: boolean },
): string | null {
  if (!res.ok || res.completed || res.deferCompletion || res.ready === true) return null;
  return GETTY_WEB_NOT_COMPLETED_NOTE;
}

/**
 * Uploads **every** icon of the run in one helper request, so Getty receives all
 * pairs in one attach instead of one pair per page visit. The batch is not
 * submitted here: the run finishes it once, after the last icon is listed.
 */
export async function uploadGettyWebRun(input: GettyWebRunInput): Promise<GettyWebRunOutcome> {
  const icons = await prepareIcons(input);
  if (typeof icons === "string") return failed(input, icons);
  const send = input.uploadFn ?? uploadBridgeGettyWeb;
  const res = await send({
    bridgeUrl: input.bridgeUrl, preset: input.target, creds: input.creds, icons,
    batchName: input.batchName, submissionType: input.submissionType,
    complete: false, sessionKey: input.sessionKey, signal: input.signal,
  });
  if (!res.ok) return failed(input, res.reason);
  const outcomes = input.icons.map((icon) => outcomeOf(icon, {
    accepted: res.accepted ?? [], failed: res.failed ?? [], notReady: res.notReady ?? [],
  }));
  const reason = outcomes.find((entry) => !entry.ok)?.reason ?? "";
  return { ok: reason === "", reason, icons: outcomes, deferCompletion: true };
}

/**
 * The panel line for a live upload reading. While the bytes are moving it counts
 * the files Getty already has (its picture is on the page); once the metadata is
 * being saved it counts the cards that turned "Ready to submit", which is what
 * actually finishes the run, and says how many are still missing.
 */
export function progressLabel(progress: GettyWebProgress, targetName: string): string {
  const of = progress.total > 0 ? ` of ${progress.total}` : "";
  const failed = progress.failed > 0 ? `, ${progress.failed} failed` : "";
  const reloaded = progress.reloads > 0 ? " — page reloaded to get it moving" : "";
  if (progress.phase === "uploading") {
    if (progress.uploaded === 0 && progress.failed === 0) return `${targetName}: uploading ${progress.listed}${of} file(s)${reloaded}`;
    return `${targetName}: ${progress.uploaded}${of} file(s) uploaded${failed}${reloaded}`;
  }
  const ready = progress.ready ?? 0;
  const pending = Math.max(0, progress.total - ready - progress.failed);
  if (progress.total === 0) return `${targetName}: saving metadata${reloaded}`;
  const left = pending > 0 ? `, ${pending} not ready yet` : "";
  return `${targetName}: ${ready}${of} file(s) ready to submit${failed}${left}${reloaded}`;
}

/**
 * Files the bar may count as done. In the upload stage that is what Getty
 * received; from the moment the metadata is saved it is **only** the cards that
 * turned "Ready to submit" (plus Getty's own rejections), so a batch whose cards
 * are still not ready can never show a finished bar.
 */
export function settledFiles(progress: GettyWebProgress): number {
  const done = progress.phase === "uploading" ? progress.uploaded : (progress.ready ?? 0);
  return done + progress.failed;
}

/** The bar stage this reading belongs to. */
export function progressPhase(progress: GettyWebProgress): "uploading" | "verifying" {
  return progress.phase === "uploading" ? "uploading" : "verifying";
}

const PROGRESS_POLL_MS = 1000;
// The helper answers 404 until its upload request is being handled, and a helper
// that dies mid-run says nothing at all: neither may kill the live progress.
const PROGRESS_MAX_MISSES = 60;

type ProgressPoll = (bridgeUrl: string, sessionKey: string) => Promise<GettyWebProgress | null>;

interface WatchState {
  input: { bridgeUrl: string; sessionKey: string };
  report: (progress: GettyWebProgress) => void;
  poll: ProgressPoll;
  stopped: boolean;
  misses: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** One reading, then the next poll — a missing helper is retried, not fatal. */
async function progressTick(state: WatchState): Promise<void> {
  if (state.stopped) return;
  const progress = await state.poll(state.input.bridgeUrl, state.input.sessionKey).catch(() => null);
  if (state.stopped) return;
  if (progress === null) state.misses += 1;
  else {
    state.misses = 0;
    state.report(progress);
    if (progress.phase === "done" || progress.phase === "failed") return;
  }
  if (state.misses <= PROGRESS_MAX_MISSES) {
    state.timer = setTimeout(() => void progressTick(state), PROGRESS_POLL_MS);
  }
}

/**
 * Polls the helper while the one upload request is in flight, so the panel shows
 * Getty's own per-file progress instead of sitting still until the batch lands.
 * Every reading (validated count included) is reported at once. Returns its stop
 * function; the first reading is taken immediately.
 */
export function watchGettyProgress(
  input: { bridgeUrl: string; sessionKey: string; targetName: string },
  onProgress: (progress: GettyWebProgress) => void,
  poll: ProgressPoll = gettyWebProgress,
): () => void {
  const state: WatchState = {
    input, report: onProgress, poll, stopped: false, misses: 0, timer: null,
  };
  state.timer = setTimeout(() => void progressTick(state), 0);
  return () => {
    state.stopped = true;
    if (state.timer !== null) clearTimeout(state.timer);
  };
}
