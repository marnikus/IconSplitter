// runcontrol.ts — the queue's async half (I-53). Owns the ONE run in flight at
// a time, waiting batches behind it, per-batch prompt/regen snapshots, and
// operation-aware front-of-queue single-item shortcuts.

import type { DirHandleLike } from "../lib/fs";
import { log } from "../log/logstore";
import type { SvgAction } from "./statemodel";
import { planOf } from "./runplan";
import { loadRegenSetting, resolveRegen } from "./regenstore";
import { loadRegenBatchPref } from "./regenprefs";
import { MAIN_PLAN, regenLabelOf, regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { resolveTaskPrompt } from "../lib/taskprompts";
import { loadTaskPrompts } from "../state/taskpromptstore";
import { inIdOrder } from "../lib/selectionorder";
import { runGeneration } from "./runner";
import { withRunLog } from "./runlog";
import {
  dropAll, dropIdFrom, dropQueued as removeQueued, enqueue, enqueueFront, nextRun, queuedCount, queueItem, shiftQueue,
  type QueueItem,
} from "./runqueue";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "./runstate";
import { chainAdd, NO_CHAIN, type Chain } from "./runtotals";
import type { BatchOutcome } from "../lib/svgbatch";
import type { Placement, SvgOperation, SvgRefs } from "./types";
import type { SvgCtx } from "./actions";

export interface ConfirmSvgDetails {
  readonly regenPresetName: string | null;
  readonly regenPerRequest?: number;
  readonly promptOverride?: string | null;
}

export type ConfirmSvgInput = string | null | ConfirmSvgDetails;

export interface RunCtx extends RunSetters {
  m: SvgCtx["m"];
  refs: SvgRefs;
  dispatch: (action: SvgAction) => void;
  rows: SvgCtx["rows"];
  say: SvgCtx["say"];
}

export interface CancelNote {
  dropped: number;
}

export function setQueue(ctx: RunCtx, queue: QueueItem[]): void {
  ctx.refs.queue.current = queue;
  ctx.dispatch({ type: "queue", queue });
}

export interface Queued {
  waiting: number;
  removedFrom: number;
}

export interface EnqueueOpts {
  readonly placement?: Placement;
  readonly regen?: RegenPlan | null;
  readonly promptOverride?: string | null;
}

function resolveEnqueueOpts(placementOrOpts: Placement | EnqueueOpts, legacyRegen: RegenPlan | null): Required<EnqueueOpts> {
  if (typeof placementOrOpts === "string") {
    return { placement: placementOrOpts, regen: legacyRegen, promptOverride: null };
  }
  return {
    placement: placementOrOpts.placement ?? "back",
    regen: placementOrOpts.regen ?? null,
    promptOverride: placementOrOpts.promptOverride ?? null,
  };
}

export function enqueueBatch(
  ctx: RunCtx,
  ids: string[],
  placementOrOpts: Placement | EnqueueOpts = "back",
  legacyRegen: RegenPlan | null = null,
): Queued {
  const { placement, regen, promptOverride } = resolveEnqueueOpts(placementOrOpts, legacyRegen);
  const item = queueItem(ids, requestsOf(ctx, ids, regen), labelOf(ctx, ids), { regen, promptOverride });
  const { queue: base, removedFrom } = placement === "front" ? withoutIds(ctx, ids) : { queue: ctx.refs.queue.current, removedFrom: 0 };
  const queue = placement === "front" ? enqueueFront(base, item) : enqueue(base, item);
  setQueue(ctx, queue);
  const suffix = `${regen ? ` · ${regenLabelOf(regen)}` : ""}${placement === "front" ? " · first in the queue" : ""}`;
  log({
    feature: "svg", action: "batch-queued",
    detail: `${ids.length} source(s) → ${item.requests} request(s)${suffix}`,
    data: { sources: ids.length, requests: item.requests, waiting: queuedCount(queue), placement, removedFrom },
  });
  return { waiting: queuedCount(queue), removedFrom };
}

function withoutIds(ctx: RunCtx, ids: string[]): { queue: QueueItem[]; removedFrom: number } {
  let queue = ctx.refs.queue.current;
  let removedFrom = 0;
  for (const id of ids) {
    const dropped = dropIdFrom(queue, id, (rest) => ({ requests: requestsOf(ctx, [...rest], null), label: labelOf(ctx, [...rest]) }));
    queue = dropped.queue;
    removedFrom += dropped.removedFrom;
  }
  return { queue, removedFrom };
}

/** Row action while a run is in flight: front of queue using that task's single-icon default prompt. */
export function regenerateNext(ctx: RunCtx, ids: string[], operation: SvgOperation = "regenerate"): void {
  const stored = loadTaskPrompts();
  const enqueueOpts = operation === "generate"
    ? frontGenerateOpts(ctx, stored)
    : { placement: "front" as const, regen: resolveCurrentRegen(ctx, stored) };
  const { waiting, removedFrom } = enqueueBatch(ctx, ids, enqueueOpts);
  const tail = removedFrom === 0 ? "" : ` · removed from ${removedFrom} waiting batch${removedFrom === 1 ? "" : "es"}`;
  ctx.say(`${labelOf(ctx, ids)} — next attempt, first in the queue (${waiting} queued)${tail}`);
}

function frontGenerateOpts(ctx: RunCtx, stored: ReturnType<typeof loadTaskPrompts>): EnqueueOpts {
  const resolved = resolveTaskPrompt({
    taskId: "svg-generate:single", stored, presets: ctx.m.presets, mainPrompt: ctx.m.prompt,
  });
  return { placement: "front", regen: null, promptOverride: resolved.presetName ? resolved.text : null };
}

function resolveCurrentRegen(ctx: RunCtx, stored = loadTaskPrompts()): RegenPlan | null {
  const resolved = resolveTaskPrompt({
    taskId: "svg-regenerate:single",
    stored,
    presets: ctx.m.presets,
    mainPrompt: ctx.m.prompt,
    legacyPresetName: loadRegenSetting().presetName,
  });
  if (resolved.presetName) {
    const res = regenPlanFromPresetName(resolved.presetName, ctx.m.presets, 1);
    if (res.ok) return res.plan;
  }
  const fallback = resolveRegen();
  return fallback.ok && fallback.plan.kind !== "main" ? fallback.plan : null;
}

export function dropWaiting(ctx: RunCtx, itemId: string): number {
  const before = ctx.refs.queue.current;
  const rest = removeQueued(before, itemId);
  if (rest.length === before.length) return queuedCount(before);
  setQueue(ctx, rest);
  return queuedCount(rest);
}

export function dropQueueForCancel(ctx: RunCtx): number {
  const { rest, dropped } = dropAll(ctx.refs.queue.current);
  if (dropped > 0) setQueue(ctx, rest);
  return dropped;
}

export function busy(ctx: RunCtx): boolean {
  return ctx.refs.abort.current !== null;
}

function normalizeConfirmInput(input: ConfirmSvgInput): Required<ConfirmSvgDetails> {
  if (input === null || typeof input === "string") {
    return { regenPresetName: input, regenPerRequest: loadRegenBatchPref().count, promptOverride: null };
  }
  return {
    regenPresetName: input.regenPresetName,
    regenPerRequest: input.regenPerRequest ?? loadRegenBatchPref().count,
    promptOverride: input.promptOverride ?? null,
  };
}

export async function confirmRun(ctx: RunCtx, input: ConfirmSvgInput): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm") return;
  const details = normalizeConfirmInput(input);
  const resolved = resolveConfirmRegen(ctx, dialog.operation, details);
  if (!resolved.ok) return ctx.say(resolved.problem, true);
  ctx.dispatch({ type: "dialog", dialog: null });
  const { waiting } = enqueueBatch(ctx, dialog.ids, {
    placement: "back",
    regen: resolved.regen,
    promptOverride: dialog.operation === "generate" ? details.promptOverride : null,
  });
  if (nextRun(ctx.refs.queue.current, busy(ctx)) === null) {
    log({ feature: "svg", action: "batch-waiting", detail: `${waiting} batch(es) waiting`, data: { waiting } });
    return ctx.say(`${dialog.ids.length} image(s) added — they wait for the run in flight (${waiting} queued)`);
  }
  await drainQueue(ctx);
}

function resolveConfirmRegen(
  ctx: RunCtx, operation: SvgOperation, details: Required<ConfirmSvgDetails>,
): { ok: true; regen: RegenPlan | null } | { ok: false; problem: string } {
  if (operation === "generate") return { ok: true, regen: null };
  if (details.regenPresetName !== null) {
    const res = regenPlanFromPresetName(details.regenPresetName, ctx.m.presets, details.regenPerRequest);
    return res.ok ? { ok: true, regen: res.plan } : res;
  }
  return { ok: true, regen: resolveCurrentRegen(ctx) };
}

async function drainQueue(ctx: RunCtx): Promise<void> {
  let head = nextRun(ctx.refs.queue.current, busy(ctx));
  let chain: Chain | null = null;
  while (head !== null) {
    setQueue(ctx, shiftQueue(ctx.refs.queue.current).rest);
    ctx.dispatch({ type: "chain", chain: chain ?? NO_CHAIN });
    const outcomes = await startRun(ctx, head);
    chain = chainAdd(chain ?? NO_CHAIN, outcomes);
    head = nextRun(ctx.refs.queue.current, busy(ctx));
  }
}

async function startRun(ctx: RunCtx, item: QueueItem): Promise<BatchOutcome[]> {
  const ids = item.ids;
  const regen = item.regen ?? MAIN_PLAN;
  const prompt = item.promptOverride ?? ctx.m.prompt;
  log({ feature: "svg", action: "generate-confirmed", detail: `${ids.length} source(s) · ${regenLabelOf(regen)}`, data: { sources: ids.length } });
  const controller = beginRun(ctx, ids);
  const sources = inIdOrder(ctx.rows, ids, (r) => r.source.id).map((r) => r.source);
  const summary = await runGeneration({
    root: ctx.refs.root.current as DirHandleLike,
    apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt, regen, sources,
    metas: ctx.refs.metas, signal: controller.signal,
    onEvent: withRunLog((event) => onRunEvent(event, ctx)),
  });
  ctx.dispatch({ type: "running", running: false });
  ctx.refs.abort.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  ctx.say(endLine(summary, controller.signal.reason), summary.saved === 0 && summary.problems.length > 0);
  return summary.outcomes;
}

function beginRun(ctx: RunCtx, ids: string[]): AbortController {
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  return controller;
}

function endLine(summary: Parameters<typeof summaryLine>[0], reason: unknown): string {
  const dropped = (reason as CancelNote | null | undefined)?.dropped ?? 0;
  const line = summaryLine(summary);
  if (dropped === 0) return line;
  return `${line} · ${dropped} queued batch${dropped === 1 ? "" : "es"} dropped`;
}

function labelOf(ctx: RunCtx, ids: string[]): string {
  const picked = inIdOrder(ctx.rows, ids, (r) => r.source.id);
  const first = picked[0]?.source.name ?? `${ids.length} source(s)`;
  const others = picked.length - 1;
  return others <= 0 ? first : `${first} + ${others} more`;
}

function requestsOf(ctx: RunCtx, ids: string[], regen: RegenPlan | null): number {
  return Math.max(1, planOf(ctx, ids, regen).length);
}
