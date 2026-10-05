// queue.ts — the Generate SVG generation queue (2026-10-05). Owns: ONE awaiting
// list of confirmed batches, frozen at the moment of confirmation, so pressing
// Generate during an active run APPENDS work instead of interrupting it or
// being refused, and what the user confirmed is exactly what will be sent.
//
// Pure data + pure functions (RULE 3): the worker that drains the queue lives in
// svg/runqueue.ts, and the queue itself lives in the SVG model so the strip
// renders it (RULE 24). It is deliberately in-memory only: a reload must never
// resend anything — restart truth stays in the in-flight journal (I-20).

import { requestCount } from "../lib/svgbatch";
import { clampImagesPerRequest } from "../lib/svgconfig";
import type { SvgConfig } from "../lib/svgconfig";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { SvgSource } from "./sources";

/**
 * Everything one confirmation agreed to send: the approved sources, the config,
 * the model's caps and the sampling values and prompt as they stood then. A
 * queued batch is sent with THIS payload, never with settings edited later.
 */
export interface QueuedRun {
  sources: readonly SvgSource[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  prompt: string;
}

/** One batch waiting for its turn. `id` is the ticket the worker takes by. */
export interface QueuedBatch {
  id: string;
  /** What the strip and the toast call it: sources, requests, model. */
  label: string;
  /** The rows it will run, for the derived "Queued" row badge. */
  sourceIds: string[];
  run: QueuedRun;
}

/** A batch as the confirmation freezes it; `ticket` is unique per enqueue. */
export function queuedBatch(ticket: string, run: QueuedRun, perRequest: number): QueuedBatch {
  return {
    id: ticket,
    label: queueLabel(run, perRequest),
    sourceIds: run.sources.map((s) => s.id),
    run,
  };
}

/** "3 sources · 2 requests · openai/gpt-6.1-sol" — the confirmed plan, named. */
export function queueLabel(run: QueuedRun, perRequest: number): string {
  const n = run.sources.length;
  const requests = requestCount(n, clampImagesPerRequest(perRequest));
  const model = run.config.model === "" ? "no model" : run.config.model;
  return `${n} source${n === 1 ? "" : "s"} · ${requests} request${requests === 1 ? "" : "s"} · ${model}`;
}

/** Appending never reorders, rewrites or drops what is already waiting. */
export function enqueue(queue: readonly QueuedBatch[], batch: QueuedBatch): QueuedBatch[] {
  return [...queue, batch];
}

/** Drops one entry by ticket; an unknown ticket leaves the queue untouched. */
export function removeQueued(queue: readonly QueuedBatch[], id: string): QueuedBatch[] {
  return queue.filter((b) => b.id !== id);
}

/** The batch that runs next: the one that has waited longest. */
export function nextQueued(queue: readonly QueuedBatch[]): QueuedBatch | null {
  return queue[0] ?? null;
}

/** Every source id a waiting batch names, so a row can say it is queued. */
export function queuedSourceIds(queue: readonly QueuedBatch[]): string[] {
  return queue.flatMap((b) => b.sourceIds);
}
