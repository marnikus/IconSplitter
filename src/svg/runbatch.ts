// runbatch.ts — ONE request of a generation run, start to finish (prompt
// §3/§4/§17; long-generation prompt 2026-10-05): build the contact sheet, send
// the composite STREAMED with the batch manifest, journal it while it is in
// flight, and keep the provider's request id. Which text the request carries
// lives in regenprompt.ts; mapping the answer back to sources and writing the
// versions lives in runsave.ts; both need this file's BatchCtx and nothing more.
//
// The wait is a stall window, never a total timeout: as long as bytes arrive
// the request runs, and a request that goes silent is reported as outcome
// UNKNOWN (the provider may still be generating and billing it) with its id —
// it is NEVER resent automatically, because a resend could be a duplicate
// charge. Only a failure the provider itself confirmed may be retried.

import { batchManifest, batchOutcome, type BatchPlan } from "../lib/svgbatch";
import { stallHint } from "../lib/effortlimits";
import { chatUrl } from "../lib/svgconfig";
import { buildChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { sendChatStreaming } from "../lib/svgstreamread";
import { attachRequestId, beginRequest, endRequest } from "./journal";
import { redact } from "../lib/svgsecret";
import { buildComposite, type BuiltComposite } from "./composite";
import { promptForCall } from "./regenprompt";
import { saveMatches, zeroUsage } from "./runsave";
import type { SvgSource } from "./sources";
import type { RunState } from "./runtypes";

export async function runBatch(state: RunState, plan: BatchPlan, index: number): Promise<void> {
  const items = plan.items.map((i) => state.args.sources.find((s) => s.id === i.sourceId)).filter(isSource);
  if (items.length === 0) return;
  const ctx = newBatchCtx({
    state, plan, index, items, startedAt: Date.now(),
    hash: "", usage: null, share: null, error: null, requestId: null, unsettled: false, promptUsed: "",
  });
  const composite = await tryComposite(ctx);
  if (composite === null) return finishBatch(ctx); // nothing was sent: every item is already failed
  announceStart(ctx, composite);
  ctx.hash = composite.hash;
  const sent = await sendBatch(ctx, composite);
  if (!sent.ok) failBatch(ctx, sent.error, sent.failure, sent.retryAfterMs);
  else await saveMatches(ctx, sent.text, sent.usage);
  finishBatch(ctx);
}

function announceStart(ctx: BatchCtx, built: BuiltComposite): void {
  const { state, plan, items, index } = ctx;
  state.args.onEvent({
    kind: "batch-start", runId: state.runId, batchId: plan.id, index, count: items.length, batches: state.total,
    perRequest: state.perRequest, cols: plan.cols, rows: plan.rows, composite: built.dataUrl, hash: built.hash,
    startedAt: ctx.startedAt, images: state.images,
  });
}

/** Everything the per-request writers need, so no writer takes seven params. */
export interface BatchCtx {
  state: RunState;
  plan: BatchPlan;
  /** 1-based request index within the run. */
  index: number;
  items: SvgSource[];
  tally: Tally;
  /** When this request was announced, for its elapsed time. */
  startedAt: number;
  hash: string;
  /** The request's own usage, exactly as the provider reported it. */
  usage: Usage | null;
  /** The same usage split across the request's images, for each pair file. */
  share: Usage | null;
  /** Redacted reason the request failed; null after an answer. */
  error: string | null;
  /** Provider request id, from the header or the stream; null until known. */
  requestId: string | null;
  /** true when there was no confirmed outcome (a stall) — never a plain failure. */
  unsettled: boolean;
  /** The text this request really carried — v2 or the main prompt (D6). */
  promptUsed: string;
}

interface Tally {
  saved: number;
  failed: number;
  missing: number;
}

function newBatchCtx(ctx: Omit<BatchCtx, "tally">): BatchCtx {
  return { ...ctx, tally: { saved: 0, failed: 0, missing: 0 } };
}

/** A composite that cannot be built must produce no request at all. */
async function tryComposite(ctx: BatchCtx): Promise<BuiltComposite | null> {
  try {
    return await buildComposite(ctx.state.args.root, ctx.items);
  } catch (error) {
    failBatch(ctx, `composite failed: ${message(error)}`, "payload", null);
    return null;
  }
}

/** One request's outcome, recorded whether it answered, failed or was skipped. */
function finishBatch(ctx: BatchCtx): void {
  const { state, plan, index, tally } = ctx;
  const report = batchOutcome({
    plan, index, model: state.args.config.model,
    saved: tally.saved, failed: tally.failed, missing: tally.missing,
    usage: ctx.usage ?? zeroUsage(), error: ctx.error,
    unknown: ctx.unsettled, elapsedMs: Date.now() - ctx.startedAt, requestId: ctx.requestId,
  });
  // Saved, failed or cancelled: this request has a confirmed outcome, so the
  // journal note is done with. A STALL keeps its note on purpose — nobody has
  // confirmed anything about it, and the next boot must say so.
  if (!ctx.unsettled) endRequest(plan.id);
  state.outcomes.push(report);
  const done = state.outcomes.reduce((n, o) => n + o.count, 0);
  state.args.onEvent({ kind: "batch-done", report, done, images: state.images });
}

interface SendOk { ok: true; text: string; usage: Usage; requestId: string | null }
interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

async function sendBatch(ctx: BatchCtx, composite: BuiltComposite): Promise<SendOk | SendBad> {
  const { state, plan, items } = ctx;
  const prompt = await promptForCall({
    root: state.args.root, mainPrompt: state.args.prompt, regen: state.args.regen,
    metas: state.args.metas, items, manifest: batchManifest(plan.items),
    note: (line) => state.problems.push(line),
  });
  ctx.promptUsed = prompt;
  const request = buildChatRequest({
    model: state.args.config.model, prompt, image: composite.dataUrl,
    caps: state.args.caps, params: state.args.params,
  });
  journalRequest(ctx);
  return sendWithRetries(ctx, request);
}

/** The attempt loop: a confirmed failure may retry, an uncertain one never. */
async function sendWithRetries(ctx: BatchCtx, request: ReturnType<typeof buildChatRequest>): Promise<SendOk | SendBad> {
  const { state } = ctx;
  for (let attempt = 0; attempt <= state.args.config.retries; attempt++) {
    if (state.args.signal.aborted) return { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };
    const out = await sendChatStreaming({
      url: chatUrl(state.args.config.baseUrl), body: request, apiKey: state.args.apiKey,
      signal: state.args.signal, stallMs: state.stallMs, onId: (id) => rememberId(ctx, id),
    });
    if (out.ok) {
      // A non-streamed answer carries no stream `id:`; keep the header id it does have.
      if (out.requestId !== null && ctx.requestId === null) ctx.requestId = out.requestId;
      return { ok: true, text: out.text, usage: out.usage, requestId: ctx.requestId };
    }
    if (!out.failure.retryable || attempt === state.args.config.retries) {
      return { ok: false, error: failureText(state, out.failure, ctx), failure: out.failure.kind, retryAfterMs: out.failure.retryAfterMs };
    }
    const waitMs = out.failure.retryAfterMs ?? backoff(attempt);
    noteRetry(ctx, attempt + 1, out.failure, waitMs);
    await delay(waitMs, state.args.signal);
  }
  return { ok: false, error: "not sent", failure: "aborted", retryAfterMs: null };
}

/** The request is about to be sent: the journal names it until it has an outcome. */
function journalRequest(ctx: BatchCtx): void {
  const { state, plan, items } = ctx;
  beginRequest({
    runId: state.runId, batchId: plan.id, index: ctx.index,
    sourceIds: items.map((i) => i.id), sourceNames: items.map((i) => i.name),
    model: state.args.config.model, startedAt: new Date(ctx.startedAt).toISOString(),
  });
}

/** The id is written the moment it arrives — the journal, then the record. */
function rememberId(ctx: BatchCtx, id: string): void {
  if (ctx.requestId === null) ctx.requestId = id;
  attachRequestId(ctx.plan.id, id);
}

/** The user-facing reason: redacted; a stall names the window and the id. */
function failureText(state: RunState, failure: Failure, ctx: BatchCtx): string {
  if (failure.kind !== "stalled") return redact(failure.message, state.args.apiKey);
  const id = ctx.requestId === null ? "" : ` Provider request id: ${ctx.requestId}.`;
  return stallHint(state.args.caps, state.args.params, state.stallMs) + id;
}

/** A retry is visible in the log while its wait runs, not only in the report. */
function noteRetry(ctx: BatchCtx, attempt: number, failure: Failure, delayMs: number): void {
  ctx.state.args.onEvent({
    kind: "request-retry", batchId: ctx.plan.id, attempt,
    retries: ctx.state.args.config.retries, failure: failure.kind,
    status: failure.status, delayMs,
  });
}

function failBatch(ctx: BatchCtx, error: string, kind: Failure["kind"], retryAfterMs: number | null): void {
  ctx.error = error;
  // A stall has no confirmed outcome: the provider may still be working on it,
  // so it is counted as unknown (and never retried), not a plain failure.
  ctx.unsettled = kind === "stalled";
  if (ctx.unsettled) ctx.state.unknown += 1;
  for (const item of ctx.items) {
    ctx.tally.failed++;
    ctx.state.failed++;
    ctx.state.problems.push(`${item.name}: ${error}`);
    ctx.state.args.onEvent({ kind: "item-failed", batchId: ctx.plan.id, position: 0, sourceId: item.id, error, failure: kind, retryAfterMs });
  }
  ctx.state.args.onEvent({ kind: "request-failed", batchId: ctx.plan.id, error, failure: kind, retryAfterMs, count: ctx.items.length, requestId: ctx.requestId });
}

function isSource(value: SvgSource | undefined): value is SvgSource {
  return value !== undefined;
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt);
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
