// runner.ts — the batched SVG-generation policy and request lifecycle.
// Owns budgets, retries, request diagnostics, cancellation and run summaries;
// per-source parsing, sidecar writes and save timings live in runitems.ts.

import { batchManifest, planBatches, type BatchPlan, type BatchSource } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { buildChatRequest, sendChatRequest, type Failure, type SendOut, type Usage } from "../lib/svgrequest";
import { requestBudgetFor, timeoutMsFor, type RequestBudget } from "../lib/svgbudget";
import { sumUsage } from "../lib/svgusage";
import { sumEstimated } from "../lib/svgpricing";
import { redact } from "../lib/svgsecret";
import { logSvgDiagnostic, safeSvgErrorText } from "../lib/svgdiagnostics";
import type { SvgConfig } from "../lib/svgconfig";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { DirHandleLike } from "../lib/fs";
import { buildComposite, type BuiltComposite } from "./composite";
import { toBatchSource, type SvgSource } from "./sources";
import { failBatch, newBatchCtx, saveMatches, type BatchFailureInfo, type BatchCtx, type CompletedBatchResponse } from "./runitems";
import type { SvgSidecar } from "../lib/svgfile";

export type RunEvent =
  | { kind: "batch-start"; batchId: string; count: number; batches: number; cols: number; rows: number; composite: string; hash: string }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; sidecar: SvgSidecar | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number; requestId: string | null; outcome: Failure["outcome"] }
  | { kind: "batch-done"; batchId: string; saved: number; failed: number; missing: number }
  | { kind: "cancelled" };

export interface RunArgs {
  root: DirHandleLike;
  apiKey: string;
  config: SvgConfig;
  /** What the selected model accepts, and the values to send with it. */
  caps: ModelCaps;
  params: SamplingParams;
  prompt: string;
  sources: readonly SvgSource[];
  /** Sidecars loaded before the run; refreshed in place as results are saved. */
  sidecars: Map<string, SvgSidecar | null>;
  onEvent: (event: RunEvent) => void;
  signal: AbortSignal;
}

export interface RunSummary {
  batches: number;
  saved: number;
  /** Number of terminal request/batch failures, not affected source rows. */
  failed: number;
  /** Failed requests whose provider-side completion or charge is uncertain. */
  uncertain: number;
  missing: number;
  invalid: number;
  cancelled: boolean;
  usage: Usage;
  estimated: number | null;
  /** Per-source error lines, already redacted. */
  problems: string[];
}

export interface RunState {
  args: RunArgs;
  total: number;
  budget: RequestBudget;
  saved: number;
  failed: number;
  uncertain: number;
  missing: number;
  invalid: number;
  usages: Usage[];
  problems: string[];
}

interface AttemptLogInput {
  state: RunState;
  plan: BatchPlan;
  request: ReturnType<typeof buildChatRequest>;
  out: SendOut;
  attempt: number;
  images: number;
}

export async function runGeneration(args: RunArgs): Promise<RunSummary> {
  const budget = requestBudgetFor(args.params.effort, {
    images: args.config.imagesPerRequest, maxTokens: args.params.maxTokens,
    timeoutMs: args.config.timeoutMs, tokenCeiling: args.caps.maxTokens.max,
  });
  const plans = planBatches(toBatchSources(args.sources), budget.imagesPerRequest);
  const state = newRunState(args, plans.length, budget);
  for (const plan of plans) {
    if (args.signal.aborted) {
      args.onEvent({ kind: "cancelled" });
      break;
    }
    await runBatch(state, plan);
  }
  return summarize(state, plans.length);
}

function newRunState(args: RunArgs, total: number, budget: RequestBudget): RunState {
  return { args, total, budget, saved: 0, failed: 0, uncertain: 0, missing: 0, invalid: 0, usages: [], problems: [] };
}

function summarize(state: RunState, batches: number): RunSummary {
  return {
    batches, saved: state.saved, failed: state.failed, uncertain: state.uncertain,
    missing: state.missing, invalid: state.invalid, cancelled: state.args.signal.aborted,
    usage: sumUsage(state.usages), estimated: sumEstimated(state.args.config.model, state.usages),
    problems: state.problems,
  };
}

async function runBatch(state: RunState, plan: BatchPlan): Promise<void> {
  const items = plan.items.map((item) => state.args.sources.find((source) => source.id === item.sourceId)).filter(isSvgSource);
  if (items.length === 0) return;
  const ctx = newBatchCtx(state, plan, items);
  const composite = await tryComposite(ctx);
  if (composite === null) return;
  announceStart(ctx, composite);
  ctx.hash = composite.hash;
  const sent = await sendBatch(ctx, composite);
  if (sent.ok) await saveMatches(ctx, completedResponse(sent));
  else await failBatch(ctx, failureInfo(sent));
  state.args.onEvent({ kind: "batch-done", batchId: plan.id, ...ctx.tally });
}

function announceStart(ctx: BatchCtx, built: BuiltComposite): void {
  ctx.state.args.onEvent({
    kind: "batch-start", batchId: ctx.plan.id, count: ctx.items.length, batches: ctx.state.total,
    cols: ctx.plan.cols, rows: ctx.plan.rows, composite: built.dataUrl, hash: built.hash,
  });
}

/** A composite that cannot be built must produce no request at all. */
async function tryComposite(ctx: BatchCtx): Promise<BuiltComposite | null> {
  try {
    return await buildComposite(ctx.state.args.root, ctx.items);
  } catch {
    const failure: Failure = {
      kind: "payload", message: "contact-sheet construction failed; no request was sent",
      retryAfterMs: null, retryable: false, outcome: "confirmed", status: null,
    };
    await failBatch(ctx, { error: failure.message, failure, requestId: null, usage: null, requestedAt: ctx.requestedAt });
    return null;
  }
}

async function sendBatch(ctx: BatchCtx, composite: BuiltComposite): Promise<SendOut> {
  const { state, plan, items } = ctx;
  const request = batchRequest(ctx, composite);
  const config = {
    ...state.args.config,
    timeoutMs: timeoutMsFor(state.budget.effort, items.length, state.budget.timeoutMs),
  };
  let attempt = 0;
  while (true) {
    const out = await sendChatRequest({ config, apiKey: state.args.apiKey, request, signal: state.args.signal });
    logAttempt({ state, plan, request, out, attempt: attempt + 1, images: items.length });
    if (out.ok || !safeToRetry(out.failure) || attempt >= config.retries) return out;
    await delay(out.failure.retryAfterMs ?? backoff(attempt), state.args.signal);
    if (state.args.signal.aborted) return out;
    attempt++;
  }
}

function batchRequest(ctx: BatchCtx, composite: BuiltComposite): ReturnType<typeof buildChatRequest> {
  const manifest = batchManifest(ctx.plan.items);
  const prompt = ctx.items.length === 1
    ? singlePrompt(ctx.state.args.prompt, ctx.items[0].stem)
    : batchPrompt(ctx.state.args.prompt, manifest);
  return buildChatRequest({
    model: ctx.state.args.config.model, prompt, image: composite.dataUrl,
    caps: ctx.state.args.caps,
    params: { ...ctx.state.args.params, maxTokens: ctx.state.budget.maxTokens },
  });
}

function logAttempt(input: AttemptLogInput): void {
  const { state, plan, request, out, attempt, images } = input;
  logSvgDiagnostic({
    kind: "request", traceId: requestTraceId(), batchId: plan.id, attempt,
    model: state.args.config.model, effort: request.reasoning_effort ?? null, images,
    maxTokens: tokenCeiling(request),
    timeoutMs: timeoutMsFor(state.budget.effort, images, state.budget.timeoutMs),
    status: out.status, retryAfterMs: out.ok ? null : out.failure.retryAfterMs,
    requestId: safeRequestId(out.requestId, state.args.apiKey),
    finishReason: out.finishReason, failure: failureKind(out), error: diagnosticError(out, state, plan), outcome: outcomeOf(out),
    inputTokens: tokenOf(out, "input"), outputTokens: tokenOf(out, "output"), timing: out.timing,
  });
}

function tokenCeiling(request: ReturnType<typeof buildChatRequest>): number {
  return request.max_tokens ?? request.max_completion_tokens ?? 0;
}

function tokenOf(out: SendOut, kind: "input" | "output"): number | null {
  return out.usage?.[kind] ?? null;
}

function failureKind(out: SendOut): Failure["kind"] | null {
  return out.ok ? null : out.failure.kind;
}

function diagnosticError(out: SendOut, state: RunState, plan: BatchPlan): string | null {
  if (out.ok) return null;
  const sources = state.args.sources.filter((source) => plan.items.some((item) => item.sourceId === source.id));
  const privateValues = sources.flatMap((source) => [source.relPath, source.name]);
  return safeSvgErrorText(out.failure.message, state.args.apiKey, state.args.prompt, privateValues);
}

function outcomeOf(out: SendOut): "complete" | "failed" | "unknown" {
  if (out.ok) return "complete";
  return out.failure.outcome === "unknown" ? "unknown" : "failed";
}

function safeRequestId(requestId: string | null, apiKey: string): string | null {
  return requestId === null ? null : redact(requestId, apiKey).slice(0, 200);
}

function requestTraceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `svg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeToRetry(failure: Failure): boolean {
  return failure.retryable && failure.outcome === "confirmed";
}

function failureInfo(out: Extract<SendOut, { ok: false }>): BatchFailureInfo {
  return {
    error: out.failure.message, failure: out.failure, requestId: out.requestId,
    usage: out.usage, requestedAt: out.timing.apiStartedAt,
  };
}

function completedResponse(out: Extract<SendOut, { ok: true }>): CompletedBatchResponse {
  return { text: out.text, usage: out.usage, requestId: out.requestId, requestedAt: out.timing.apiStartedAt };
}

function isSvgSource(source: SvgSource | undefined): source is SvgSource {
  return source !== undefined;
}

function toBatchSources(sources: readonly SvgSource[]): BatchSource[] {
  return sources.map(toBatchSource);
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt);
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
