// runbatch.ts — ONE request of a generation run, start to finish (prompt
// §3/§4/§17): build the contact sheet, send the composite with the batch
// manifest, map every returned block back to its source by name (never by
// guess), save each valid result as the next version, record the request's own
// status/tokens/cost, and isolate its failure from every other request. A
// position the provider skipped stays pending; an invalid result is recorded
// as a failed version. The whole request is retried only when the failure is
// retryable, and a timeout is never retried because its outcome is unknown.

import { batchManifest, batchOutcome, type BatchPlan } from "../lib/svgbatch";
import { timeoutHint } from "../lib/effortlimits";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import { buildPayload } from "../lib/svgpayload";
import { sendChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { allocateUsage } from "../lib/svgusage";
import { redact } from "../lib/svgsecret";
import { newSidecar, withVersion, type SvgSidecar } from "../lib/svgfile";
import { buildComposite, type BuiltComposite } from "./composite";
import { recordFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import { saveSidecar } from "./sidecar";
import type { SvgSource } from "./sources";
import type { RunState } from "./runtypes";

export async function runBatch(state: RunState, plan: BatchPlan, index: number): Promise<void> {
  const items = plan.items.map((i) => state.args.sources.find((s) => s.id === i.sourceId)).filter(isSource);
  if (items.length === 0) return;
  const ctx = newBatchCtx({ state, plan, index, items, hash: "", usage: null, share: null, error: null, requestId: null });
  const composite = await tryComposite(ctx);
  if (composite === null) return finishBatch(ctx); // nothing was sent: every item is already failed
  announceStart(ctx, composite);
  ctx.hash = composite.hash;
  const sent = await sendBatch(ctx, composite);
  if (sent.ok) {
    ctx.requestId = sent.requestId;
    await saveMatches(ctx, sent.text, sent.usage);
  } else {
    failBatch(ctx, sent.error, sent.failure, sent.retryAfterMs);
  }
  finishBatch(ctx);
}

function announceStart(ctx: BatchCtx, built: BuiltComposite): void {
  const { state, plan, items, index } = ctx;
  state.args.onEvent({
    kind: "batch-start", batchId: plan.id, index, count: items.length, batches: state.total,
    perRequest: state.perRequest, cols: plan.cols, rows: plan.rows, composite: built.dataUrl, hash: built.hash,
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
  hash: string;
  /** The request's own usage, exactly as the provider reported it. */
  usage: Usage | null;
  /** The same usage split across the request's images, for each sidecar. */
  share: Usage | null;
  /** Redacted reason the request failed; null after an answer. */
  error: string | null;
  /** Provider request id once the request answered; null before and on failure. */
  requestId: string | null;
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
    usage: ctx.usage ?? zeroUsage(), error: ctx.error, requestId: ctx.requestId,
  });
  state.outcomes.push(report);
  state.args.onEvent({ kind: "batch-done", report });
}

interface SendOk { ok: true; text: string; usage: Usage; requestId: string | null }
interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

async function sendBatch(ctx: BatchCtx, composite: BuiltComposite): Promise<SendOk | SendBad> {
  const { state, plan } = ctx;
  // The prompt/request come from the ONE builder the confirmation previews, so
  // the text a page shows is the text this request carries (feature §1).
  const payload = buildPayload({
    model: state.args.config.model, userPrompt: state.args.prompt,
    manifest: batchManifest(plan.items), image: composite.dataUrl,
    caps: state.args.caps, params: state.args.params,
  });
  const config = { ...state.args.config, timeoutMs: state.timeoutMs };
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    if (state.args.signal.aborted) return { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };
    const out = await sendChatRequest({ config, apiKey: state.args.apiKey, request: payload.request, signal: state.args.signal });
    if (out.ok) return { ok: true, text: out.text, usage: out.usage, requestId: out.requestId };
    if (!out.failure.retryable || attempt === config.retries) {
      return { ok: false, error: failureText(state, out.failure), failure: out.failure.kind, retryAfterMs: out.failure.retryAfterMs };
    }
    await waitToRetry(state, { batchId: plan.id, attempt, retries: config.retries, failure: out.failure });
  }
  return { ok: false, error: "not sent", failure: "aborted", retryAfterMs: null };
}

/** Everything one retry decision carries (RULE 16.4: four params is the cap). */
interface RetryPlan {
  batchId: string;
  attempt: number;
  retries: number;
  failure: Failure;
}

/** Announces the retry and its wait, then waits — the log reads this event. */
async function waitToRetry(state: RunState, plan: RetryPlan): Promise<void> {
  const delayMs = plan.failure.retryAfterMs ?? backoff(plan.attempt);
  state.args.onEvent({
    kind: "request-retry", batchId: plan.batchId, attempt: plan.attempt + 1, retries: plan.retries,
    failure: plan.failure.kind, status: plan.failure.status, delayMs,
  });
  await delay(delayMs, state.args.signal);
}

/** The user-facing reason: redacted, and for a timeout it names the tier and the fix. */
function failureText(state: RunState, failure: Failure): string {
  if (failure.kind !== "timeout") return redact(failure.message, state.args.apiKey);
  return timeoutHint(state.args.caps, state.args.params, state.timeoutMs);
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
  const sidecar = state.args.sidecars.get(item.id) ?? null;
  const usage = ctx.share ?? zeroUsage();
  const args: SaveArgs = {
    root: state.args.root, source: item, code, prompt: state.args.prompt,
    provider: "Requesty", model: state.args.config.model, requestedAt: new Date().toISOString(),
    usage, batch: toBatchRef(plan, position, ctx.hash, batchManifest(plan.items)), requestId: null, sidecar,
  };
  const out = await saveSvgVersion(args);
  if (!out.ok) return rejectOne(ctx, item, position, out.error);
  ctx.tally.saved++;
  state.saved++;
  const stored = await persist(state, item, out.sidecar);
  state.args.onEvent({ kind: "item-saved", batchId: plan.id, position, sourceId: item.id, version: out.version, icons: out.icons, warnings: out.warnings, usage, sidecar: stored });
}

function toBatchRef(plan: BatchPlan, position: number, hash: string, manifest: { position: number; name: string }[]): SaveArgs["batch"] {
  return { batchId: plan.id, position, compositeHash: hash, manifest: manifest.map((m) => `${m.position} — ${m.name}`).join("\n") };
}

function zeroUsage(): Usage {
  return { input: null, output: null, total: null, cost: null, currency: "USD" };
}

/** An invalid result is recorded, never written as a successful version. */
async function rejectOne(ctx: BatchCtx, item: SvgSource, position: number, error: string): Promise<void> {
  const sidecar = ctx.state.args.sidecars.get(item.id) ?? null;
  const { state, plan } = ctx;
  ctx.tally.failed++;
  state.invalid++;
  state.problems.push(`${item.name}: ${error}`);
  // A charged attempt keeps its share of the usage, and a source without a
  // sidecar gets one so no task can vanish without its cost.
  const rec = recordFailure({
    source: item, prompt: state.args.prompt, provider: "Requesty", model: state.args.config.model,
    requestedAt: new Date().toISOString(), error, sidecar, usage: ctx.share ?? zeroUsage(),
  });
  const next = withVersion(sidecar ?? newSidecar({ relPath: item.relPath, name: item.name, fingerprint: item.fingerprint }), rec);
  await persist(state, item, next);
  state.args.onEvent({ kind: "item-failed", batchId: plan.id, position, sourceId: item.id, error, failure: "malformed", retryAfterMs: null });
}

/** Writes the sidecar and keeps the in-memory copy in step (RULE 24). */
async function persist(state: RunState, item: SvgSource, sidecar: SvgSidecar | null): Promise<SvgSidecar | null> {
  if (!sidecar) return null;
  state.args.sidecars.set(item.id, sidecar);
  try {
    await saveSidecar(state.args.root, item, sidecar);
  } catch {
    state.problems.push(`${item.name}: sidecar could not be written — the SVG is saved, retry the save`);
  }
  return sidecar;
}

function failBatch(ctx: BatchCtx, error: string, kind: Failure["kind"], retryAfterMs: number | null): void {
  ctx.error = error;
  for (const item of ctx.items) {
    ctx.tally.failed++;
    ctx.state.failed++;
    ctx.state.problems.push(`${item.name}: ${error}`);
    ctx.state.args.onEvent({ kind: "item-failed", batchId: ctx.plan.id, position: 0, sourceId: item.id, error, failure: kind, retryAfterMs });
  }
  ctx.state.args.onEvent({ kind: "request-failed", batchId: ctx.plan.id, error, failure: kind, retryAfterMs, count: ctx.items.length });
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
