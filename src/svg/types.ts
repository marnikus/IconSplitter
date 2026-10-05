// types.ts — the Generate SVG tab's shared shapes (prompt §2/§4).
// Kept in one file so the hook, the row model, the scan and the dialogs all
// speak the same language without importing each other.

import type { SvgSidecar, SvgVersion } from "../lib/svgfile";
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
  sidecar: SvgSidecar | null;
  /** true when the sidecar exists but could not be parsed (SVGs are kept). */
  corrupt: boolean;
  /** Newest valid version — what the preview shows by default. */
  newest: SvgVersion | null;
  /** The version currently carrying an approval, if any. */
  approved: SvgVersion | null;
  status: RowStatus;
  error: string | null;
  running: boolean;
}

/** Live state of the run: the batch in flight plus every finished request. */
export interface RunProgress {
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
  /** One outcome per finished request, in request order. */
  outcomes: BatchOutcome[];
}

export type Dialog =
  | { kind: "confirm"; ids: string[] }
  | { kind: "code"; id: string; version: number }
  | { kind: "history"; id: string };

/** Mutable internals shared by the state and action halves of the hook. */
export interface SvgRefs {
  root: { current: unknown };
  sidecars: Map<string, SvgSidecar | null>;
  abort: { current: AbortController | null };
  key: { current: string | null };
  /** The key of the committed snapshot: an unchanged scan commits nothing. */
  scanKey: { current: string | null };
  /** Which scan may commit (see lib/scanseq). */
  seq: { current: ScanSeq };
  /** The id of the run in flight, so Cancel and the log can name it. */
  run: { current: string | null };
}
