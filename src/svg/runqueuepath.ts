// runqueuepath.ts — how a batch gets INTO the queue (2026-10-20): the frozen
// spec the popup confirmed, the confirmation's append, and the two dialog-less
// "next attempt" paths a row can ask for while a run is in flight. Split from
// runcontrol so neither file outgrows the size gate (RULE 18) and so the
// planning rules (`labelOf`, `requestsOf`) are readable in one place.

import { log } from "../log/logstore";
import { planOf } from "./runplan";
import { resolveRegen } from "./regenstore";
import { MAIN_PLAN, clampRegenPerRequest, regenLabelOf, regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { resolveTaskPrompt, taskOf, type PromptChoice, type PromptWork } from "../lib/prompttasks";
import { loadTaskPrompts } from "../state/prompttasksstore";
import { loadRegenCodes, type RegenCode } from "./regencodes";
import { inIdOrder } from "../lib/selectionorder";
import { dropIdFrom, enqueue, enqueueFront, queuedCount, queueItem, type QueueItem } from "./runqueue";
import { setQueue, type Queued, type RunCtx } from "./runcontext";
import type { DirHandleLike } from "../lib/fs";
import type { Placement } from "./types";

/** What one batch is queued with: everything the popup froze (I-76). */
export interface BatchSpec {
  ids: string[];
  placement?: Placement;
  regen?: RegenPlan | null;
  prompt?: PromptChoice;
  codes?: ReadonlyMap<string, RegenCode>;
}

/** Queues one batch — behind what waits, or first (a row's next attempt). */
export function enqueueBatch(ctx: RunCtx, spec: BatchSpec): Queued {
  const { ids, placement = "back", regen = null } = spec;
  const requests = requestsOf(ctx, ids, regen);
  const item = queueItem({ ids, requests, label: labelOf(ctx, ids), regen, prompt: spec.prompt, codes: spec.codes });
  const { queue: base, removedFrom } = placement === "front" ? withoutIds(ctx, ids) : { queue: ctx.refs.queue.current, removedFrom: 0 };
  const queue = placement === "front" ? enqueueFront(base, item) : enqueue(base, item);
  setQueue(ctx, queue);
  log({
    feature: "svg", action: "batch-queued",
    detail: `${ids.length} source(s) → ${requests} request(s) · ${promptLabelOf(item)}${placement === "front" ? " · first in the queue" : ""}`,
    data: { sources: ids.length, requests, waiting: queuedCount(queue), placement, removedFrom },
  });
  return { waiting: queuedCount(queue), removedFrom };
}

/** What the log calls this batch's prompt: the plan, plus a chosen preset's name. */
function promptLabelOf(item: QueueItem): string {
  const plan = item.regen === null ? "main prompt + first image" : regenLabelOf(item.regen);
  return item.prompt.kind === "preset" ? `${plan} · prompt “${item.prompt.name}”` : plan;
}

/** The images leave every batch that still waits for them (one queue, one attempt each). */
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

/**
 * A row's Regenerate while a run is in flight (2026-10-08): the NEXT attempt.
 * No dialog — but regeneration needs a saved prompt and its frozen codes, so a
 * shape with no stored prompt is refused in words instead of quietly sending
 * the main prompt (I-74).
 */
export async function regenerateNext(ctx: RunCtx, ids: string[]): Promise<void> {
  const regen = storedRegenPlan(ctx, ids.length);
  if (regen.kind === "main") {
    return ctx.say("Regeneration needs a saved prompt — open the regeneration popup and pick one", true);
  }
  const root = ctx.refs.root.current as DirHandleLike | null;
  const codes = root === null ? new Map<string, RegenCode>() : (await loadRegenCodes(root, ctx.rows, ids)).codes;
  const { waiting, removedFrom } = enqueueBatch(ctx, { ids, placement: "front", regen, prompt: promptFor(ctx, ids.length), codes });
  const tail = removedFrom === 0 ? "" : ` · removed from ${removedFrom} waiting batch${removedFrom === 1 ? "" : "es"}`;
  ctx.say(`${labelOf(ctx, ids)} — next attempt, first in the queue (${waiting} queued)${tail}`);
  log({ feature: "svg", action: "batch-next", detail: `${ids.length} source(s) · first in the queue`, data: { sources: ids.length, removedFrom } });
}

/** A row's plain "generate again" while a run is in flight: first in line, no dialog. */
export function nextGenerate(ctx: RunCtx, ids: string[]): void {
  const { waiting, removedFrom } = enqueueBatch(ctx, { ids, placement: "front", prompt: promptFor(ctx, ids.length, "svg.generate") });
  const tail = removedFrom === 0 ? "" : ` · removed from ${removedFrom} waiting batch${removedFrom === 1 ? "" : "es"}`;
  ctx.say(`${labelOf(ctx, ids)} — next attempt, first in the queue (${waiting} queued)${tail}`);
}

/** The stored prompt of this shape, resolved against the saved presets (RULE 24). */
export function promptFor(ctx: RunCtx, count: number, work: PromptWork = "svg.regenerate"): PromptChoice {
  const task = taskOf(work, count);
  const entry = loadTaskPrompts()[task];
  return resolveTaskPrompt(task, entry, { presets: ctx.m.presets, mainPrompt: ctx.m.prompt }).choice;
}

/**
 * The regeneration a dialog-less path starts with: this shape's remembered
 * prompt at the remembered size, else the legacy stored choice, else none.
 */
function storedRegenPlan(ctx: RunCtx, count: number): RegenPlan {
  const size = clampRegenPerRequest(ctx.m.config.imagesPerRequest);
  const choice = promptFor(ctx, count);
  if (choice.kind === "preset") {
    const res = regenPlanFromPresetName(choice.name, ctx.m.presets, size);
    if (res.ok) return res.plan;
  }
  const legacy = resolveRegen();
  if (legacy.ok && legacy.plan.kind === "current-svg") return legacy.plan;
  const first = ctx.m.presets.find((p) => p.text.trim() !== "");
  return first === undefined ? MAIN_PLAN : (regenPlanFromPresetName(first.name, ctx.m.presets, size).ok ? { kind: "current-svg", presetName: first.name, presetText: first.text, size } : MAIN_PLAN);
}

/** "fog_AI.png + 3 more" — enough to recognise the batch while it waits. */
export function labelOf(ctx: RunCtx, ids: string[]): string {
  const picked = inIdOrder(ctx.rows, ids, (r) => r.source.id);
  const first = picked[0]?.source.name ?? `${ids.length} source(s)`;
  const others = picked.length - 1;
  return others <= 0 ? first : `${first} + ${others} more`;
}

/** The requests this selection becomes — the number the confirmation showed (RULE 10). */
export function requestsOf(ctx: RunCtx, ids: string[], regen: RegenPlan | null): number {
  return Math.max(1, planOf(ctx, ids, regen).length);
}
