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
import type { RegenPlan } from "../lib/svgregen";
import type { PromptChoice } from "../lib/prompttasks";
import type { RegenCode } from "./regencodes";

export type RunEvent =
  /** `images` = the run's image total, so every reader can say "N of M done". */
  | { kind: "run-start"; batches: number; perRequest: number; images: number }
  /** `runId` tells one run from the next: batch ids (`batch_1_…`) repeat per run. */
  | { kind: "batch-start"; runId: string; batchId: string; index: number; count: number; batches: number; perRequest: number; cols: number; rows: number; composite: string; hash: string; startedAt: number; images: number }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; meta: PairMeta | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  /** A retryable failure is about to be retried; the wait happens after this. */
  | { kind: "request-retry"; batchId: string; attempt: number; retries: number; failure: Failure["kind"]; status: number | null; delayMs: number }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number; requestId: string | null }
  /** `done` = images of the run with a confirmed outcome once this request is counted. */
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
  /**
   * The prompt THIS batch sends: the stored main prompt or a saved preset's own
   * text, frozen when the batch was confirmed (2026-10-20, I-76). Absent means
   * the main prompt (every pre-existing caller).
   */
  promptChoice?: PromptChoice;
  /** The main prompt, or the saved prompt that regenerates from each icon's current SVG (2026-10-09). */
  regen: RegenPlan;
  /**
   * The current SVG code of every icon in a regeneration batch, read ONCE at
   * confirmation so the previewed text is the sent text. A missing entry fails
   * that request; it never falls back to the main prompt (2026-10-20).
   */
  regenCodes?: ReadonlyMap<string, RegenCode>;
  sources: readonly SvgSource[];
  /** Sidecars loaded before the run; refreshed in place as results are saved. */
  metas: Map<string, PairMeta | null>;
  onEvent: (event: RunEvent) => void;
  signal: AbortSignal;
  /** Request-local cancellation never aborts the owning run. Cleared in finally. */
  onRequestController?: (controller: AbortController | null) => void;
  /**
   * Generate through the user's ChatGPT page via the local helper instead of
   * the provider API (2026-11-03). One icon per request; no key, no cost.
   */
  web?: WebTransport;
}

/** One request handed to the web transport: the text, the picture, its name and its cancel. */
export interface WebRequest {
  prompt: string;
  /** The request's reference image as a PNG data URL. */
  image: string;
  /** Names the turn for the helper's progress and cancel. */
  key: string;
  signal: AbortSignal;
  /** The prompt's own icon line: the helper reads the reply below THIS prompt. */
  anchor?: string;
  /** What the activity bar calls this request (the icon's name). */
  label?: string;
}

/** The same answer shape the API path gives the run: reply text, or a classified failure. */
export type WebSend =
  | { ok: true; text: string; usage: Usage; requestId: string | null }
  | { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: null };

/**
 * Who answers instead of the provider API (runweb.ts createWebTransport). It
 * keeps its own state (the chat it is in); the run only calls it.
 */
export interface WebTransport {
  /** Recorded as each version's model: what answered, never the API model. */
  readonly model: string;
  /** Recorded as each version's provider ("Web: chatgpt.com"); follows a restarted chat. */
  provider(): string;
  send(request: WebRequest): Promise<WebSend>;
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
  /** How many images this run carries. */
  images: number;
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
