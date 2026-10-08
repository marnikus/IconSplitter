// runtypes.ts — the shared vocabulary of a generation run (RULE 5): what the
// runner is told, what it emits while it works and what it reports at the end.
// Kept in its own module so runner.ts (the run) and runbatch.ts (one request)
// can both speak it without importing each other.

import type { BatchOutcome } from "../lib/svgbatch";
import type { Failure, Usage } from "../lib/svgrequest";
import type { SvgConfig } from "../lib/svgconfig";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { DirHandleLike } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import type { SvgSource } from "./sources";

export type RunEvent =
  | { kind: "run-start"; batches: number; perRequest: number; images: number }
  | { kind: "batch-start"; batchId: string; index: number; count: number; images: number; batches: number; perRequest: number; cols: number; rows: number; composite: string; hash: string; startedAt: number }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; meta: PairMeta | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  /** A retryable failure is about to be retried; the wait happens after this. */
  | { kind: "request-retry"; batchId: string; attempt: number; retries: number; failure: Failure["kind"]; status: number | null; delayMs: number }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number; requestId: string | null }
  /** `done` = images settled so far in the run (this request included); `images` = the run total. */
  | { kind: "batch-done"; report: BatchOutcome; done: number; images: number }
  | { kind: "cancelled" };

export interface RunArgs {
  /** One confirmation = one run; the journal uses it to name what was in flight. */
  runId?: string;
  root: DirHandleLike;
  apiKey: string;
  config: SvgConfig;
  /** What the selected model accepts, and the values to send with it. */
  caps: ModelCaps;
  params: SamplingParams;
  prompt: string;
  sources: readonly SvgSource[];
  /** Sidecars loaded before the run; refreshed in place as results are saved. */
  metas: Map<string, PairMeta | null>;
  onEvent: (event: RunEvent) => void;
  signal: AbortSignal;
}

export interface RunSummary {
  /** Icons one request was allowed to carry (effort-aware, never > configured). */
  perRequest: number;
  /** Requests the plan had; some may never have been sent when cancelled. */
  batches: number;
  saved: number;
  failed: number;
  missing: number;
  invalid: number;
  /** Requests whose outcome could not be confirmed (stalled); never retried. */
  unknown: number;
  cancelled: boolean;
  usage: Usage;
  /** Sum of the calculated (rate-card) parts; reported money is never merged in. */
  estimated: number | null;
  /** Per-source error lines, already redacted. */
  problems: string[];
  /** One record per request that was sent, in order. */
  outcomes: BatchOutcome[];
}

/** What a run accumulates while it works; only the runner reads it. */
export interface RunState {
  args: RunArgs;
  /** How many requests this run has, for the progress line. */
  total: number;
  perRequest: number;
  /** Images the whole run carries, and how many have a settled result so far. */
  images: number;
  settled: number;
  /** The wait really used: the configured stall window raised to the tier floor. */
  stallMs: number;
  /** One confirmation = one run; written into the journal with every request. */
  runId: string;
  saved: number;
  failed: number;
  missing: number;
  invalid: number;
  unknown: number;
  usages: Usage[];
  outcomes: BatchOutcome[];
  problems: string[];
}
