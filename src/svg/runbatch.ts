// runbatch.ts — ONE request of a generation run, start to finish (prompt
// §3/§4/§17; long-generation prompt 2026-10-05): build the contact sheet, send
// the composite STREAMED with the batch manifest, journal it while it is in
// flight, keep the provider's request id, map every returned block back to its
// source by name (never by guess), save each valid result as the next version,
// record the request's own status/tokens/cost, and isolate its failure from
// every other request.
//
// The wait is a stall window, never a total timeout: as long as bytes arrive
// the request runs, and a request that goes silent is reported as outcome
// UNKNOWN (the provider may still be generating and billing it) with its id —
// it is NEVER resent automatically, because a resend could be a duplicate
// charge. Only a failure the provider itself confirmed may be retried.

import { batchManifest, batchOutcome, type BatchPlan } from "../lib/svgbatch";
import { stallHint } from "../lib/effortlimits";
import { chatUrl } from "../lib/svgconfig";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import { buildChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { sendChatStreaming } from "../lib/svgstreamread";
import { attachRequestId, beginRequest, endRequest } from "./journal";
import { allocateUsage } from "../lib/svgusage";
import { redact } from "../lib/svgsecret";
import { type PairMeta } from "../lib/pairmeta";
import { saveMetaAt } from "../selection/pairfile";
import { buildComposite, type BuiltComposite } from "./composite";
import { metaAfterFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import type { SvgSource } from "./sources";
import type { RunState } from "./runtypes";

export async function runBatch(state: RunState, plan: BatchPlan, index: number): Promise<void> {
  const items = plan.items.map((i) => state.args.sources.find((s) => s.id === i.sourceId)).filter(isSource);
  if (items.length === 0) return;
  const ctx = newBatchCtx({
    state, plan, index, items, startedAt: Date.now(),
    hash: "", usage: null, share: null, error: null, requestId: null, unsettled: false,
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
    kind: "batch-start", batchId: plan.id, index, count: items.length, batches: state.total,
    perRequest: state.perRequest, cols: plan.cols, rows: plan.rows, composite: built.dataUrl, hash: built.hash,
    startedAt: ctx.startedAt,
  });
}

/** Everything the per-request writers need, so no writer takes seven params. */
interface BatchCtx {
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
  // Saved, failed or cancelled: this request has a confirmed outcome, so its
  // journal note is done with. A STALL keeps its note on purpose — nobody has
  // confirmed anything about it, and the next boot must say so.
  if (!ctx.unsettled) endRequest(plan.id);
  state.outcomes.push(report);
  state.args.onEvent({ kind: "batch-done", report });
}

interface SendOk { ok: true; text: string; usage: Usage; requestId: string | null }
interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

async function sendBatch(ctx: BatchCtx, composite: BuiltComposite): Promise<SendOk | SendBad> {
  const { state, plan, items } = ctx;
  const manifest = batchManifest(plan.items);
  const prompt = items.length === 1 ? singlePrompt(state.args.prompt, items[0].stem) : batchPrompt(state.args.prompt, manifest);
  const request = buildChatRequest({
    model: state.args.config.model, prompt, image: composite.dataUrl,
    caps: state.args.caps, params: state.args.params,
  });
  journalRequest(ctx);
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

async function saveMatches(ctx: BatchCtx, text: string, usage: Usage): Promise<void> {
  const matched = matchBlocks(extractSvgBlocks(text), batchManifest(ctx.plan.items));
  ctx.state.usages.push(usage);
  ctx.usage = usage;
  ctx.share = allocateUsage(usage, ctx.items.length);
  for (const item of ctx.items) {
    const position = ctx.plan.items.find((i) => i.sourceId === item.id)?.position ?? 0;
    const code = matched.byPosition.get(position);
    if (code === undefined) await missOne(ctx, item, position);
    else await saveOne(ctx, item, position, code);
  }
}

/** A position the provider did not answer stays pending — never guessed at. */
async function missOne(ctx: BatchCtx, item: SvgSource, position: number): Promise<void> {
  const { state, plan, tally } = ctx;
  tally.missing++;
  state.missing++;
  state.problems.push(`${item.name}: no SVG returned for position ${position}`);
  state.args.onEvent({ kind: "item-failed", batchId: plan.id, position, sourceId: item.id, error: "no SVG returned for this position", failure: "malformed", retryAfterMs: null });
}

async function saveOne(ctx: BatchCtx, item: SvgSource, position: number, code: string): Promise<void> {
  const { state, plan } = ctx;
  state.args.onEvent({ kind: "item-start", batchId: plan.id, position, sourceId: item.id });
  const meta = state.args.metas.get(item.id) ?? null;
  const usage = ctx.share ?? zeroUsage();
  const args: SaveArgs = {
    root: state.args.root, source: item, code, prompt: state.args.prompt,
    provider: "Requesty", model: state.args.config.model, requestedAt: new Date().toISOString(),
    usage, batch: toBatchRef(plan, position, ctx.hash, batchManifest(plan.items)), requestId: ctx.requestId, meta,
  };
  const out = await saveSvgVersion(args);
  if (!out.ok) return rejectOne(ctx, item, position, out.error);
  ctx.tally.saved++;
  state.saved++;
  const stored = await persist(state, item, out.meta);
  state.args.onEvent({ kind: "item-saved", batchId: plan.id, position, sourceId: item.id, version: out.version, icons: out.icons, warnings: out.warnings, usage, meta: stored });
}

function toBatchRef(plan: BatchPlan, position: number, hash: string, manifest: { position: number; name: string }[]): SaveArgs["batch"] {
  return { batchId: plan.id, position, compositeHash: hash, manifest: manifest.map((m) => `${m.position} — ${m.name}`).join("\n") };
}

function zeroUsage(): Usage {
  return { input: null, output: null, total: null, cost: null, currency: "USD" };
}

/** An invalid result is recorded, never written as a successful version. */
async function rejectOne(ctx: BatchCtx, item: SvgSource, position: number, error: string): Promise<void> {
  const meta = ctx.state.args.metas.get(item.id) ?? null;
  const { state, plan } = ctx;
  ctx.tally.failed++;
  state.invalid++;
  state.problems.push(`${item.name}: ${error}`);
  // A charged attempt keeps its share of the usage, and a pair without a file
  // gets one so no task can vanish without its cost (I-41).
  const next = metaAfterFailure({
    source: item, prompt: state.args.prompt, provider: "Requesty", model: state.args.config.model,
    requestedAt: new Date().toISOString(), error, meta, usage: ctx.share ?? zeroUsage(),
  });
  await persist(state, item, next);
  state.args.onEvent({ kind: "item-failed", batchId: plan.id, position, sourceId: item.id, error, failure: "malformed", retryAfterMs: null });
}

/** Writes the pair's own file and keeps the in-memory copy in step (RULE 24). */
async function persist(state: RunState, item: SvgSource, meta: PairMeta | null): Promise<PairMeta | null> {
  if (!meta) return null;
  state.args.metas.set(item.id, meta);
  try {
    await saveMetaAt(state.args.root, item.metaPath, meta);
  } catch {
    state.problems.push(`${item.name}: its pair file could not be written — the SVG is saved, retry the save`);
  }
  return meta;
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
  // so it is counted as unknown (and never retried), not as a plain failure.
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
    const done = () => {
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
