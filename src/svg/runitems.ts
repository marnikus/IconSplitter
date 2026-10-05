// runitems.ts — map one completed SVG batch back to its sources and persist outcomes.
// Owns per-source validation/failure records, usage allocation and save timings.

import { batchRefOf, type BatchPlan } from "../lib/svgbatch";
import { extractSvgBlocks, matchBlocks } from "../lib/svgextract";
import { allocateUsage } from "../lib/svgusage";
import { newSidecar, withVersion, type SvgSidecar } from "../lib/svgfile";
import { NO_USAGE, type Failure, type Usage } from "../lib/svgrequest";
import { logSvgDiagnostic, safeSvgErrorText } from "../lib/svgdiagnostics";
import type { RunState } from "./runner";
import { recordFailure, saveSvgVersion, type SaveArgs } from "./saveversion";
import { saveSidecar } from "./sidecar";
import type { SvgSource } from "./sources";

export interface Tally {
  saved: number;
  failed: number;
  missing: number;
}

export interface BatchCtx {
  state: RunState;
  plan: BatchPlan;
  items: SvgSource[];
  tally: Tally;
  hash: string;
  usage: Usage | null;
  requestId: string | null;
  requestedAt: string;
}

export interface BatchFailureInfo {
  error: string;
  failure: Failure;
  requestId: string | null;
  usage: Usage | null;
  requestedAt: string;
}

export interface CompletedBatchResponse {
  text: string;
  usage: Usage;
  requestId: string | null;
  requestedAt: string;
}

interface ItemFailure {
  error: string;
  status: "failed" | "interrupted";
  completedAt: string | null;
}

interface SaveTiming {
  durationMs: number;
  sidecarMs: number;
}

interface RejectionArgs {
  item: SvgSource;
  position: number;
  error: string;
  started: number;
}

/** A single batch context carries every per-item writer's shared state. */
export function newBatchCtx(state: RunState, plan: BatchPlan, items: SvgSource[]): BatchCtx {
  return {
    state, plan, items, tally: { saved: 0, failed: 0, missing: 0 }, hash: "", usage: null,
    requestId: null, requestedAt: new Date().toISOString(),
  };
}

/** Saves only title/name-matched blocks; missing positions remain failed, never shifted. */
export async function saveMatches(ctx: BatchCtx, response: CompletedBatchResponse): Promise<void> {
  const started = performance.now();
  const blocks = extractSvgBlocks(response.text);
  const matched = matchBlocks(blocks, ctx.plan.items);
  logSvgDiagnostic({ kind: "svg-parse", batchId: ctx.plan.id, durationMs: duration(started), blocks: blocks.length, matched: matched.byPosition.size });
  ctx.state.usages.push(response.usage);
  ctx.usage = allocateUsage(response.usage, ctx.items.length);
  ctx.requestId = response.requestId;
  ctx.requestedAt = response.requestedAt;
  for (const item of ctx.items) {
    const position = positionOf(ctx, item);
    const code = matched.byPosition.get(position);
    if (code === undefined) await missOne(ctx, item, position);
    else await saveOne(ctx, item, position, code);
  }
}

/** A request-level failure is written to every source before the run continues. */
export async function failBatch(ctx: BatchCtx, info: BatchFailureInfo): Promise<void> {
  if (info.usage !== null) ctx.state.usages.push(info.usage);
  ctx.state.failed++;
  if (info.failure.outcome === "unknown") ctx.state.uncertain++;
  ctx.usage = info.usage === null ? null : allocateUsage(info.usage, ctx.items.length);
  ctx.requestId = info.requestId;
  ctx.requestedAt = info.requestedAt;
  const error = safeErrorText(ctx, userFailureMessage(info));
  for (const item of ctx.items) await failOne(ctx, item, error, info.failure);
  ctx.state.args.onEvent({
    kind: "request-failed", batchId: ctx.plan.id, error, failure: info.failure.kind,
    retryAfterMs: info.failure.retryAfterMs, count: ctx.items.length,
    requestId: info.requestId, outcome: info.failure.outcome,
  });
}

/** A position with no returned SVG is recorded with its share of the terminal usage. */
async function missOne(ctx: BatchCtx, item: SvgSource, position: number): Promise<void> {
  const started = performance.now();
  const error = `no SVG returned for position ${position}`;
  ctx.tally.missing++;
  ctx.state.missing++;
  ctx.state.problems.push(`${item.name}: ${error}`);
  const sidecarMs = await recordItemFailure(ctx, item, position, { error, status: "failed", completedAt: new Date().toISOString() });
  ctx.state.args.onEvent({ kind: "item-failed", batchId: ctx.plan.id, position, sourceId: item.id, error, failure: "malformed", retryAfterMs: null });
  logSave(ctx, position, { durationMs: duration(started), sidecarMs }, "failed");
}

async function saveOne(ctx: BatchCtx, item: SvgSource, position: number, code: string): Promise<void> {
  const started = performance.now();
  ctx.state.args.onEvent({ kind: "item-start", batchId: ctx.plan.id, position, sourceId: item.id });
  const args = saveArgs(ctx, item, code, position);
  const out = await saveSvgVersion(args);
  if (!out.ok) return rejectOne(ctx, { item, position, error: out.error, started });
  ctx.tally.saved++;
  ctx.state.saved++;
  const sidecarMs = await persist(ctx.state, item, out.sidecar);
  logSave(ctx, position, { durationMs: duration(started), sidecarMs }, "saved");
  ctx.state.args.onEvent({
    kind: "item-saved", batchId: ctx.plan.id, position, sourceId: item.id,
    version: out.version, icons: out.icons, warnings: out.warnings, usage: ctx.usage ?? NO_USAGE, sidecar: out.sidecar,
  });
}

/** An invalid SVG is retained as a failed version; the prior valid file is untouched. */
async function rejectOne(ctx: BatchCtx, args: RejectionArgs): Promise<void> {
  const { item, position, error, started } = args;
  const safeError = safeErrorText(ctx, error);
  ctx.tally.failed++;
  ctx.state.invalid++;
  ctx.state.problems.push(`${item.name}: ${safeError}`);
  const sidecarMs = await recordItemFailure(ctx, item, position, { error: safeError, status: "failed", completedAt: new Date().toISOString() });
  ctx.state.args.onEvent({ kind: "item-failed", batchId: ctx.plan.id, position, sourceId: item.id, error: safeError, failure: "malformed", retryAfterMs: null });
  logSave(ctx, position, { durationMs: duration(started), sidecarMs }, "failed");
}

/** Appends a safe failure record, retaining old SVGs and the real request ID. */
async function failOne(ctx: BatchCtx, item: SvgSource, error: string, failure: Failure): Promise<void> {
  const started = performance.now();
  const position = positionOf(ctx, item);
  const status = failure.outcome === "unknown" || failure.kind === "aborted" ? "interrupted" : "failed";
  const safeError = safeErrorText(ctx, error);
  ctx.tally.failed++;
  ctx.state.problems.push(`${item.name}: ${safeError}`);
  const sidecarMs = await recordItemFailure(ctx, item, position, {
    error: safeError, status, completedAt: failure.outcome === "unknown" ? null : new Date().toISOString(),
  });
  ctx.state.args.onEvent({ kind: "item-failed", batchId: ctx.plan.id, position, sourceId: item.id, error: safeError, failure: failure.kind, retryAfterMs: failure.retryAfterMs });
  logSave(ctx, position, { durationMs: duration(started), sidecarMs }, "failed");
}

async function recordItemFailure(ctx: BatchCtx, item: SvgSource, position: number, failure: ItemFailure): Promise<number> {
  const prior = ctx.state.args.sidecars.get(item.id) ?? null;
  const record = recordFailure({
    source: item, prompt: ctx.state.args.prompt, provider: "Requesty", model: ctx.state.args.config.model,
    requestedAt: ctx.requestedAt, completedAt: failure.completedAt, error: failure.error,
    status: failure.status, requestId: ctx.requestId, sidecar: prior, usage: ctx.usage ?? NO_USAGE,
    batch: ctx.hash === "" ? null : batchRefOf(ctx.plan, position, ctx.hash),
  });
  const next = withVersion(prior ?? newSidecar({ relPath: item.relPath, name: item.name, fingerprint: item.fingerprint }), record);
  return persist(ctx.state, item, next);
}

function saveArgs(ctx: BatchCtx, item: SvgSource, code: string, position: number): SaveArgs {
  return {
    root: ctx.state.args.root, source: item, code, prompt: ctx.state.args.prompt,
    provider: "Requesty", model: ctx.state.args.config.model, requestedAt: ctx.requestedAt,
    usage: ctx.usage ?? NO_USAGE, batch: batchRefOf(ctx.plan, position, ctx.hash),
    requestId: ctx.requestId, sidecar: ctx.state.args.sidecars.get(item.id) ?? null,
  };
}

/** Sidecar IO is timed and keeps the in-memory copy current even when disk rejects it. */
async function persist(state: RunState, item: SvgSource, sidecar: SvgSidecar): Promise<number> {
  const started = performance.now();
  state.args.sidecars.set(item.id, sidecar);
  try {
    await saveSidecar(state.args.root, item, sidecar);
  } catch {
    state.problems.push(`${item.name}: sidecar could not be written — the SVG is saved, retry the save`);
  }
  return duration(started);
}

function logSave(ctx: BatchCtx, position: number, timing: SaveTiming, outcome: "saved" | "failed"): void {
  logSvgDiagnostic({ kind: "save", batchId: ctx.plan.id, position, durationMs: timing.durationMs, sidecarMs: timing.sidecarMs, outcome });
}

function positionOf(ctx: BatchCtx, item: SvgSource): number {
  return ctx.plan.items.find((planned) => planned.sourceId === item.id)?.position ?? 0;
}

function safeErrorText(ctx: BatchCtx, text: string): string {
  const sources = ctx.items.flatMap((item) => [item.relPath, item.name]);
  return safeSvgErrorText(text, ctx.state.args.apiKey, ctx.state.args.prompt, sources);
}

function userFailureMessage(info: BatchFailureInfo): string {
  const retry = info.failure.kind === "rate_limit" && (info.failure.retryAfterMs ?? 0) > 0
    ? `; retry after ${Math.ceil((info.failure.retryAfterMs ?? 0) / 1000)} s` : "";
  const certainty = info.failure.outcome === "unknown" ? "; outcome unknown, not retried — check Requesty before retrying" : "";
  const request = info.requestId === null ? "" : ` (Requesty request ${info.requestId})`;
  return `${info.error}${retry}${certainty}${request}`;
}

function duration(started: number): number {
  return Math.max(0, performance.now() - started);
}
