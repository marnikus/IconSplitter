// runqueuepath.ts — how a batch gets INTO the queue (2026-10-20): the frozen
// spec the popup confirmed, the confirmation's append, and the session-only scheduling handoff. Split from
// runcontrol so neither file outgrows the size gate (RULE 18) and so the
// planning rules (`labelOf`, `requestsOf`) are readable in one place.

import { captureRun } from "./jobstate";
import { log } from "../log/logstore";
import { planOf } from "./runplan";
import { regenLabelOf, type RegenPlan } from "../lib/svgregen";
import { type PromptChoice } from "../lib/prompttasks";
import { inIdOrder } from "../lib/selectionorder";
import { enqueue, queuedCount, queueItem, type QueueItem } from "./runqueue";
import { setQueue, type RunCtx } from "./runcontext";
import type { RegenCode } from "./regencodes";

/** What one batch is queued with: everything the popup froze (I-76). */
export interface BatchSpec {
  ids: string[];
  regen?: RegenPlan | null;
  prompt?: PromptChoice;
  codes?: ReadonlyMap<string, RegenCode>;
}

/** Record one explicit confirmation; only the scheduler may start it. */
export function enqueueBatch(ctx: RunCtx, spec: BatchSpec): void {
  const { ids, regen = null } = spec;
  const requests = requestsOf(ctx, ids, regen);
  const item = queueItem({ ids, requests, label: labelOf(ctx, ids), regen, prompt: spec.prompt, codes: spec.codes });
  captureRun(ctx, item.id);
  const queue = enqueue(ctx.refs.queue.current, item);
  setQueue(ctx, queue);
  log({
    feature: "svg", action: "batch-queued",
    detail: `${ids.length} source(s) → ${requests} request(s) · ${promptLabelOf(item)}`,
    data: { sources: ids.length, requests, waiting: queuedCount(queue) },
  });
}

/** What the log calls this batch's prompt: the plan, plus a chosen preset's name. */
function promptLabelOf(item: QueueItem): string {
  const plan = item.regen === null ? "main prompt + first image" : regenLabelOf(item.regen);
  return item.prompt.kind === "preset" ? `${plan} · prompt “${item.prompt.name}”` : plan;
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
