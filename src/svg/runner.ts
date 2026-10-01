// runner.ts — the batched generation run (prompt §2/§4/§8/§17).
// Owns: turning the selection into batches, sending one composite request per
// batch, mapping every returned SVG back to its source, saving valid results,
// reporting partial failures, and honouring cancellation. It never overwrites
// an existing version, never retries a request whose outcome is unknown, and
// never guesses a mapping — an unmatched or duplicate result is reported.

import { batchManifest, planBatches, type BatchPlan, type BatchSource } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import { buildChatRequest, sendChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { allocateUsage, sumUsage } from "../lib/svgusage";
import { costInfoFor } from "../lib/svgpricing";
import { redact } from "../lib/svgsecret";
import type { SvgConfig } from "../lib/svgconfig";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { DirHandleLike } from "../lib/fs";
import { newSidecar, withVersion, type SvgSidecar } from "../lib/svgfile";
import { buildComposite, type BuiltComposite } from "./composite";
import { recordFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import { saveSidecar } from "./sidecar";
import { toBatchSource, type SvgSource } from "./sources";

export type RunEvent =
  | { kind: "batch-start"; batchId: string; count: number; batches: number; cols: number; rows: number; composite: string; hash: string }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; sidecar: SvgSidecar | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number }
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
  failed: number;
  missing: number;
  invalid: number;
  cancelled: boolean;
  usage: Usage;
  /** Sum of the calculated (rate-card) parts; reported money is never merged in. */
  estimated: number | null;
  /** Per-source error lines, already redacted. */
  problems: string[];
}

export async function runGeneration(args: RunArgs): Promise<RunSummary> {
  const plans = planBatches(toBatchSources(args.sources), args.config.imagesPerRequest);
  const state = newRunState(args, plans.length);
  for (const plan of plans) {
    if (args.signal.aborted) {
      args.onEvent({ kind: "cancelled" });
      break;
    }
    await runBatch(state, plan);
  }
  return {
    batches: plans.length,
    saved: state.saved,
    failed: state.failed,
    missing: state.missing,
    invalid: state.invalid,
    cancelled: args.signal.aborted,
    usage: sumUsage(state.usages),
    estimated: sumEstimated(args.config.model, state.usages),
    problems: state.problems,
  };
}

/** The calculated part of a run's cost: null when nothing had to be estimated. */
function sumEstimated(model: string, usages: readonly Usage[]): number | null {
  const parts = usages.map((u) => costInfoFor(model, u)).flatMap((c) => (c.estimated === null ? [] : [c.estimated]));
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
}

interface Tally {
  saved: number;
  failed: number;
  missing: number;
}

interface RunState {
  args: RunArgs;
  /** How many batches this run has, for the progress line. */
  total: number;
  saved: number;
  failed: number;
  missing: number;
  invalid: number;
  usages: Usage[];
  problems: string[];
}

function newRunState(args: RunArgs, total: number): RunState {
  return { args, total, saved: 0, failed: 0, missing: 0, invalid: 0, usages: [], problems: [] };
}

async function runBatch(state: RunState, plan: BatchPlan): Promise<void> {
  const items = plan.items.map((i) => state.args.sources.find((s) => s.id === i.sourceId)).filter(isSource);
  if (items.length === 0) return;
  const ctx = newBatchCtx({ state, plan, items, hash: "", usage: null });
  const composite = await tryComposite(ctx);
  if (composite === null) return; // nothing was sent: every item is already failed
  announceStart(ctx, composite);
  ctx.hash = composite.hash;
  const sent = await sendBatch(state, plan, items, composite);
  if (!sent.ok) failBatch(ctx, sent.error, sent.failure, sent.retryAfterMs);
  else await saveMatches(ctx, sent.text, sent.usage);
  state.args.onEvent({ kind: "batch-done", batchId: plan.id, ...ctx.tally });
}

function announceStart(ctx: BatchCtx, built: BuiltComposite): void {
  const { state, plan, items } = ctx;
  state.args.onEvent({
    kind: "batch-start", batchId: plan.id, count: items.length, batches: ctx.state.total,
    cols: plan.cols, rows: plan.rows, composite: built.dataUrl, hash: built.hash,
  });
}

/** Everything the per-batch writers need, so no writer takes seven params. */
interface BatchCtx {
  state: RunState;
  plan: BatchPlan;
  items: SvgSource[];
  tally: Tally;
  hash: string;
  /** This batch's usage split across its images (an estimate by construction). */
  usage: Usage | null;
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

interface SendOk { ok: true; text: string; usage: Usage }
interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

async function sendBatch(state: RunState, plan: BatchPlan, items: SvgSource[], composite: BuiltComposite): Promise<SendOk | SendBad> {
  const manifest = batchManifest(plan.items);
  const prompt = items.length === 1 ? singlePrompt(state.args.prompt, items[0].stem) : batchPrompt(state.args.prompt, manifest);
  const request = buildChatRequest({
    model: state.args.config.model, prompt, image: composite.dataUrl,
    caps: state.args.caps, params: state.args.params,
  });
  for (let attempt = 0; attempt <= state.args.config.retries; attempt++) {
    if (state.args.signal.aborted) return { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };
    const out = await sendChatRequest({ config: state.args.config, apiKey: state.args.apiKey, request, signal: state.args.signal });
    if (out.ok) return { ok: true, text: out.text, usage: out.usage };
    if (!out.failure.retryable || attempt === state.args.config.retries) {
      return { ok: false, error: redact(out.failure.message, state.args.apiKey), failure: out.failure.kind, retryAfterMs: out.failure.retryAfterMs };
    }
    await delay(out.failure.retryAfterMs ?? backoff(attempt), state.args.signal);
  }
  return { ok: false, error: "not sent", failure: "aborted", retryAfterMs: null };
}

async function saveMatches(ctx: BatchCtx, text: string, usage: Usage): Promise<void> {
  const matched = matchBlocks(extractSvgBlocks(text), batchManifest(ctx.plan.items));
  ctx.state.usages.push(usage);
  ctx.usage = allocateUsage(usage, ctx.items.length);
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
  const usage = ctx.usage ?? zeroUsage();
  const args: SaveArgs = {
    root: state.args.root, source: item, code, prompt: state.args.prompt,
    provider: "Requesty", model: state.args.config.model, requestedAt: new Date().toISOString(),
    usage, batch: toBatchRef(plan, position, ctx.hash, batchManifest(plan.items)), requestId: null, sidecar,
  };
  const out = await saveSvgVersion(args);
  if (!out.ok) return rejectOne(ctx, item, position, out.error);
  ctx.tally.saved++;
  state.saved++;
  const stored = await persist(ctx.state, item, out.sidecar);
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
    requestedAt: new Date().toISOString(), error, sidecar, usage: ctx.usage ?? zeroUsage(),
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

/** Selection order is the batch order: the scan's deterministic order. */
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
