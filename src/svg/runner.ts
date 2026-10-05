// runner.ts — the batched generation run (prompt §2/§4/§8/§17).
// Owns: turning the selection into batches, sending one composite request per
// batch, mapping every returned SVG back to its source, saving valid results,
// reporting partial failures, and honouring cancellation. It never overwrites
// an existing version, never retries a request whose outcome is unknown, and
// never guesses a mapping — an unmatched or duplicate result is reported.

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import type { Failure, Usage } from "../lib/svgrequest";
import { allocateUsage, sumUsage } from "../lib/svgusage";
import { costInfoFor } from "../lib/svgpricing";
import type { SvgConfig } from "../lib/svgconfig";
import type { PreparedBatch, PreparedRun } from "../lib/svgpayload";
import type { DirHandleLike } from "../lib/fs";
import { newSidecar, withVersion, type SvgSidecar } from "../lib/svgfile";
import { buildComposite, type BuiltComposite } from "./composite";
import { recordFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import { saveSidecar } from "./sidecar";
import type { RunEvent } from "./runevent";
import { message, sendBatch } from "./send";
import type { SvgSource } from "./sources";

export type { RunEvent } from "./runevent";

export interface RunArgs {
  root: DirHandleLike;
  apiKey: string;
  /** Timeout, retries and base URL — every other fact of a request is in `prepared`. */
  config: SvgConfig;
  /** The requests the user confirmed. They are posted as they are, never rebuilt. */
  prepared: PreparedRun;
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
  const batches = args.prepared.batches;
  const state = newRunState(args, batches.length);
  for (const batch of batches) {
    if (args.signal.aborted) {
      args.onEvent({ kind: "cancelled" });
      break;
    }
    await runBatch(state, batch);
  }
  return {
    batches: batches.length,
    saved: state.saved,
    failed: state.failed,
    missing: state.missing,
    invalid: state.invalid,
    cancelled: args.signal.aborted,
    usage: sumUsage(state.usages),
    estimated: sumEstimated(args.prepared.model, state.usages),
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

async function runBatch(state: RunState, batch: PreparedBatch): Promise<void> {
  const { plan } = batch;
  const items = plan.items.map((i) => state.args.sources.find((s) => s.id === i.sourceId)).filter(isSource);
  const ctx = newBatchCtx({ state, plan, items, hash: "", usage: null });
  if (items.length !== plan.items.length) return failBatch(ctx, "selection changed after confirmation — nothing was sent", "payload", null);
  const composite = await tryComposite(ctx);
  if (composite === null) return; // nothing was sent: every item is already failed
  announceStart(ctx, composite);
  ctx.hash = composite.hash;
  const sent = await sendBatch(state.args, batch, composite.dataUrl);
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
    return await buildComposite(ctx.state.args.root, ctx.plan.items);
  } catch (error) {
    failBatch(ctx, `composite failed: ${message(error)}`, "payload", null);
    return null;
  }
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
    root: state.args.root, source: item, code, prompt: state.args.prepared.rules,
    provider: "Requesty", model: state.args.prepared.model, requestedAt: new Date().toISOString(),
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
    source: item, prompt: state.args.prepared.rules, provider: "Requesty", model: state.args.prepared.model,
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
