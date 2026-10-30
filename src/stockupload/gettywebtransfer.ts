// gettywebtransfer.ts — the whole run as **batches**. Getty takes at most 100
// uploads per batch and one icon (JPEG, plus its EPS when it has one) is one
// upload, so a bigger selection is chunked: each chunk is uploaded, given its
// metadata and completed on the web before the next batch exists. An icon Getty
// did not accept is retried **once** — in a later batch with room, or in the
// run's final retry batch — and only then reported as failed.

import type { DirHandleLike } from "../lib/fs";
import {
  GETTY_WEB_MAX_ATTEMPTS, gettyWebBatchLabel, gettyWebBatchName, planGettyWebBatches,
  type GettyWebBatchSlot,
} from "../lib/stockupload/gettyweb";
import {
  finishBridgeGettyWeb, uploadBridgeGettyWeb, type GettyWebErrorCode, type GettyWebFinishInput,
  type GettyWebResult, type GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import { prepareGettyWebIcon, type GettyWebIconInput } from "../lib/stockupload/gettywebprep";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { StockFtpPreset } from "../lib/stockupload/types";
import {
  createState, failIcon, finalOutcome, settleBatch, type PreparedIcon, type RunState,
} from "./gettywebstate";

export type { GettyWebIconInput } from "../lib/stockupload/gettywebprep";

export interface GettyWebRunInput {
  icons: readonly GettyWebIconInput[];
  root: DirHandleLike;
  target: StockFtpPreset;
  creds: FtpCredentials;
  combine: boolean;
  submissionType: string;
  sessionKey: string;
  bridgeUrl: string;
  signal: AbortSignal;
  /** The date the batch names carry; the run's own clock by default. */
  now?: Date;
  /** Batch size; the real cap unless a test injects a smaller one. */
  maxIcons?: number;
  uploadFn?: (input: GettyWebUploadInput) => Promise<GettyWebResult>;
  finishFn?: (input: GettyWebFinishInput) => Promise<GettyWebResult>;
  /** The batch a request belongs to, so the panel's line can name it. */
  onBatch?: (label: string) => void;
  /** One batch's outcome, for the log trail — counts only, never a name. */
  onBatchFinished?: (info: BatchFinished) => void;
}

export interface BatchFinished {
  label: string;
  uploaded: number;
  submitted: boolean;
  ready: boolean;
}

/** What one icon of the run is worth: uploaded, or the reason it is not. */
export interface GettyWebIconOutcome {
  ok: boolean;
  reason: string;
}

export interface GettyWebRunOutcome {
  ok: boolean;
  /** Non-empty when an icon (or the whole run) did not upload. */
  reason: string;
  icons: GettyWebIconOutcome[];
  /** Batches created, and how many of them were completed on the web. */
  batches: number;
  completed: number;
  /** Icons still not uploaded after their retry — the re-upload list. */
  failed: number;
  /** A batch that uploaded but could not be completed, with Getty's reason. */
  batchError: string | null;
}

/** Reads and prepares the icons of one batch; an unreadable one fails on its own. */
async function prepareMembers(state: RunState, members: readonly number[]): Promise<PreparedIcon[]> {
  const prepared: PreparedIcon[] = [];
  for (const index of members) {
    const icon = await prepareGettyWebIcon(state.input.root, state.input.icons[index], state.input.combine);
    if (typeof icon === "string") { failIcon(state, index, icon); continue; }
    prepared.push({ index, icon });
  }
  return prepared;
}

/** Sends the batch; the request itself is one attach for the whole chunk. */
function sendBatch(state: RunState, prepared: readonly PreparedIcon[], batchName: string): Promise<GettyWebResult> {
  const send = state.input.uploadFn ?? uploadBridgeGettyWeb;
  return send({
    bridgeUrl: state.input.bridgeUrl, preset: state.input.target, creds: state.input.creds,
    icons: prepared.map((entry) => entry.icon), batchName,
    submissionType: state.input.submissionType, complete: false, newBatch: true,
    sessionKey: state.input.sessionKey, signal: state.input.signal,
  });
}

/** Only the batches Getty closed are counted, and only its own reading says so. */
async function completeBatch(state: RunState, uploaded: number, label: string): Promise<void> {
  const finish = state.input.finishFn ?? finishBridgeGettyWeb;
  const res = await finish({
    bridgeUrl: state.input.bridgeUrl, preset: state.input.target,
    creds: state.input.creds, sessionKey: state.input.sessionKey,
  });
  if (!res.ok) state.lastError = [state.lastError, res.reason].filter(Boolean).join(" — ");
  else {
    const note = completionNote(res);
    if (note !== null) state.lastError = note;
  }
  const submitted = res.ok && res.completed !== false;
  const ready = res.ok && res.ready === true;
  if (submitted || ready) state.completed += 1;
  state.input.onBatchFinished?.({ label, uploaded, submitted, ready });
}

/** Session-level codes cannot be fixed by retrying: they end the run. */
const SESSION_LEVEL_CODES: ReadonlySet<GettyWebErrorCode> = new Set(["auth", "browser", "helper-down"]);

function noteFailureCode(state: RunState, res: GettyWebResult): void {
  if (res.ok || !SESSION_LEVEL_CODES.has(res.code)) return;
  state.stopReason = res.reason;
}

async function runBatch(state: RunState, members: readonly number[], slot: GettyWebBatchSlot): Promise<void> {
  const prepared = await prepareMembers(state, members);
  if (prepared.length === 0) return;
  const input = state.input;
  const label = gettyWebBatchLabel(slot);
  const name = gettyWebBatchName(input.now ?? new Date(), prepared.length, slot);
  state.batches += 1;
  for (const entry of prepared) state.attempts[entry.index] = (state.attempts[entry.index] ?? 0) + 1;
  input.onBatch?.(label);
  const res = await sendBatch(state, prepared, name);
  settleBatch(state, prepared, res);
  noteFailureCode(state, res);
  const accepted = prepared.filter((entry) => state.outcomes[entry.index]?.ok === true).length;
  // An empty batch is never created or completed: there is nothing to submit.
  if (accepted > 0) await completeBatch(state, accepted, label);
}

function stopped(state: RunState): boolean {
  return state.stopReason !== null || state.input.signal.aborted;
}

/** The chunk, plus whatever is queued and still fits in this batch's room. */
function membersWithRetries(state: RunState, chunk: readonly number[]): number[] {
  const room = Math.max(0, state.maxIcons - chunk.length);
  const extra = room > 0 ? state.queue.splice(0, room) : [];
  return [...chunk, ...extra];
}

async function runPrimaryPass(state: RunState): Promise<void> {
  const indexes = state.input.icons.map((_icon, index) => index);
  const chunks = planGettyWebBatches(indexes, state.maxIcons);
  for (let k = 0; k < chunks.length; k += 1) {
    if (stopped(state)) return;
    await runBatch(state, membersWithRetries(state, chunks[k]), { index: k + 1, total: chunks.length });
  }
}

/** What is left after the last primary batch goes into retry batches. */
async function runRetryPass(state: RunState): Promise<void> {
  for (let pass = 0; pass < GETTY_WEB_MAX_ATTEMPTS && state.queue.length > 0; pass += 1) {
    if (stopped(state)) return;
    const queued = state.queue.splice(0, state.queue.length);
    const chunks = planGettyWebBatches(queued, state.maxIcons);
    for (let k = 0; k < chunks.length; k += 1) {
      if (stopped(state)) return;
      await runBatch(state, chunks[k], { index: k + 1, total: chunks.length, retry: true });
    }
  }
}

/**
 * Uploads **the whole run**, one batch at a time: plan the chunks, send each
 * one, complete it on the web, then start the next from the same signed-in
 * session. Icons Getty did not accept are retried once before the run ends.
 */
export async function uploadGettyWebRun(input: GettyWebRunInput): Promise<GettyWebRunOutcome> {
  const state = createState(input);
  await runPrimaryPass(state);
  await runRetryPass(state);
  return finalOutcome(state);
}

const GETTY_WEB_NOT_COMPLETED_NOTE =
  "files uploaded but the batch was not completed — submit it on the Getty contributor page";

/**
 * A batch that uploaded but stopped before Complete needs a manual finish. One
 * whose every card carries "Ready to submit" is finished too: the page simply
 * had no Complete control to click.
 */
export function completionNote(
  res: { ok: boolean; completed?: boolean; deferCompletion?: boolean; ready?: boolean },
): string | null {
  if (!res.ok || res.completed || res.deferCompletion || res.ready === true) return null;
  return GETTY_WEB_NOT_COMPLETED_NOTE;
}
