// runtypes.ts — the shared vocabulary of a generation run (RULE 5): what the
// runner is told, what it emits while it works and what it reports at the end.
// Kept in its own module so runner.ts (the run) and runbatch.ts (one request)
// can both speak it without importing each other.

import type { BatchOutcome } from "../lib/svgbatch";
import type { Failure, Usage } from "../lib/svgrequest";
import type { SvgConfig } from "../lib/svgconfig";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { DirHandleLike } from "../lib/fs";
import type { SvgSidecar } from "../lib/svgfile";
import type { SvgSource } from "./sources";

export type RunEvent =
  | { kind: "run-start"; batches: number; perRequest: number }
  | { kind: "batch-start"; batchId: string; index: number; count: number; batches: number; perRequest: number; cols: number; rows: number; composite: string; hash: string; startedAt: number }
  // Facts about the wire, emitted beside the retry loop (runbatch.ts). The UI
  // ignores kinds it does not know; the log's adapter (runlog.ts) mirrors them.
  // The runner itself never imports the log (observer, not instrumentation).
  | { kind: "request-sent"; batchId: string; attempt: number; of: number; hash: string }
  | { kind: "request-ok"; batchId: string; attempt: number; status: number; ms: number; requestId: string | null; usage: Usage }
  | { kind: "request-retry"; batchId: string; attempt: number; of: number; failure: Failure["kind"]; status: number | null; waitMs: number; error: string }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; sidecar: SvgSidecar | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number; requestId: string | null }
  | { kind: "batch-done"; report: BatchOutcome }
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
  sidecars: Map<string, SvgSidecar | null>;
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
