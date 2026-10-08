// types.ts — the Generate SVG tab's shared shapes (prompt §2/§4).
// Kept in one file so the hook, the row model, the scan and the dialogs all
// speak the same language without importing each other.

import type { SvgVersion } from "../lib/svgmodel";
import type { PairMeta } from "../lib/pairmeta";
import type { ScanSeq } from "../lib/scanseq";
import type { BatchOutcome } from "../lib/svgbatch";
import type { SvgSource } from "./sources";

/**
 * "unknown" is not a failure: a stalled/interrupted request may still be
 * generating (and charged) at the provider, so the honest state is "we do not
 * know" until the user retries it deliberately (prompt 2026-10-05).
 */
export type RowStatus = "not-generated" | "generating" | "generated" | "failed" | "unknown";

/** One list row: the approved source plus everything known about its SVGs. */
export interface SvgRow {
  source: SvgSource;
  meta: PairMeta | null;
  /** true when the pair file exists but could not be parsed (SVGs are kept). */
  corrupt: boolean;
  /** Newest valid version — what exists in the history (I-54 never deletes it). */
  newest: SvgVersion | null;
  /** The version the user chose (I-54), when it is still usable; else null. */
  preferred: SvgVersion | null;
  /** The version currently carrying an approval, if any. */
  approved: SvgVersion | null;
  status: RowStatus;
  error: string | null;
  running: boolean;
  /**
   * Waiting in a queued batch (2026-10-08): the badge says "Next attempt" in
   * grey. Derived from the queue, never stored, so dropping the batch needs no
   * restore — the row's own `status` is untouched underneath.
   */
  queued: boolean;
}

/** Where a confirmed batch goes: behind what waits (bulk) or first (a row's Regenerate). */
export type Placement = "front" | "back";

/** Live state of the run: the batch in flight plus every finished request. */
export interface RunProgress {
  /** The run this request belongs to — batch ids repeat per run, this does not. */
  runId: string;
  batchId: string;
  /** 1-based index of the request in flight. */
  index: number;
  batches: number;
  count: number;
  cols: number;
  rows: number;
  /** Composite image data URL — shown in the batch preview. */
  composite: string;
  hash: string;
  saved: number;
  failed: number;
  missing: number;
  /** When this request started, so the strip can tick the elapsed time. */
  startedAt: number;
  /** Icons one request was allowed to carry in this run. */
  perRequest: number;
  /** Images the whole run carries — what "N of M done" counts against. */
  images: number;
  /** One outcome per finished request, in request order. */
  outcomes: BatchOutcome[];
}

import type { QueueItem } from "./runqueue";

export type { QueueItem } from "./runqueue";

export type Dialog =
  | { kind: "confirm"; ids: string[] }
  | { kind: "code"; id: string; version: number }
  | { kind: "history"; id: string };

/** Mutable internals shared by the state and action halves of the hook. */
export interface SvgRefs {
  root: { current: unknown };
  metas: Map<string, PairMeta | null>;
  abort: { current: AbortController | null };
  /**
   * The queue in waiting order — the SYNCHRONOUS authority (I-53): a run in
   * flight is `abort.current !== null`, and confirming while it runs appends
   * here. `model.queue` mirrors it for rendering, one writer, no drift.
   */
  queue: { current: QueueItem[] };
  key: { current: string | null };
  /** The key of the committed snapshot: an unchanged scan commits nothing. */
  scanKey: { current: string | null };
  /** Which scan may commit (see lib/scanseq). */
  seq: { current: ScanSeq };
}
