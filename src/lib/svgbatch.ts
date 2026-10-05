// svgbatch.ts — batch planning and per-request outcome for composite SVG
// requests (prompt §2/§3/§14). Owns: deterministic batch order, the batch-local
// position id (1-based, never a list index), the smallest square grid that fits
// a batch, the manifest the provider receives, the pre-send validation of a
// plan, and the outcome record of one finished request (status, saved/failed/
// missing, tokens and the one cost decision). Stable source ids travel beside
// the position so a result can always be mapped back to its file.

import { clampImagesPerRequest } from "./svgconfig";
import { costInfoFor } from "./svgpricing";
import type { CostInfo } from "./svgfile";
import type { Usage } from "./svgrequest";

/** One source image inside one request. */
export interface BatchItem {
  /** Batch-local position, 1-based. This is the id the provider answers with. */
  position: number;
  /** Stable source identity (pair id) — survives sorting and filtering. */
  sourceId: string;
  /** SVG base name, e.g. "fog_architecture_041_AI" (the manifest name). */
  name: string;
  /** Path of the AI image relative to the scanned root. */
  relPath: string;
  /** size:mtime fingerprint of the AI image at plan time. */
  fingerprint: string;
}

export interface BatchPlan {
  id: string;
  items: BatchItem[];
  /** Grid columns = ceil(sqrt(count)); rows = ceil(count / columns). */
  cols: number;
  rows: number;
  /** Unused trailing cells — they must never produce an SVG. */
  emptyCells: number;
}

export interface ManifestItem {
  position: number;
  name: string;
  relPath: string;
}

/** A source the user selected, before it is assigned to a batch. */
export interface BatchSource {
  sourceId: string;
  name: string;
  relPath: string;
  fingerprint: string;
}

/** Smallest square-ish grid: 3 images -> 2x2 with one empty cell, 4 -> 2x2. */
export function gridSize(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 0, rows: 0 };
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

/** Splits the selection into deterministic batches of at most `perRequest`. */
export function planBatches(sources: readonly BatchSource[], perRequest: number): BatchPlan[] {
  const size = clampImagesPerRequest(perRequest);
  const out: BatchPlan[] = [];
  for (let start = 0; start < sources.length; start += size) {
    out.push(toBatch(sources.slice(start, start + size), out.length + 1));
  }
  return out;
}

function toBatch(slice: readonly BatchSource[], index: number): BatchPlan {
  const items = slice.map((s, i) => ({ ...s, position: i + 1 }));
  const { cols, rows } = gridSize(items.length);
  return {
    id: `batch_${index}_${items.length}`,
    items,
    cols,
    rows,
    emptyCells: cols * rows - items.length,
  };
}

/** The manifest lines for a batch, in position order. */
export function batchManifest(items: readonly BatchItem[]): ManifestItem[] {
  return items.map((i) => ({ position: i.position, name: i.name, relPath: i.relPath }));
}

/** Position ids a batch never fills — shown as empty cells in the preview. */
export function emptyPositions(plan: BatchPlan): number[] {
  const used = new Set(plan.items.map((i) => i.position));
  const all = Array.from({ length: plan.cols * plan.rows }, (_, i) => i + 1);
  return all.filter((p) => !used.has(p));
}

/** Row/column of a position in the grid (0-based), reading order. */
export function cellOf(position: number, cols: number): { row: number; col: number } {
  const i = Math.max(0, position - 1);
  return { row: Math.floor(i / cols), col: i % cols };
}

/** How many requests a selection of `count` images becomes at `perRequest`. */
export function requestCount(count: number, perRequest: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / Math.max(1, perRequest));
}

/**
 * Why a plan must not be sent, or [] when it can. The confirmation and the
 * runner both call this before a single byte leaves: a plan that cannot be
 * mapped back to its sources is a bug, and the user is told instead of the app
 * guessing (RULE 15 spirit — fail closed).
 */
export function validateBatchPlan(plans: readonly BatchPlan[], perRequest: number): string[] {
  const size = Math.max(1, perRequest);
  const problems: string[] = [];
  for (const plan of plans) {
    if (plan.items.length === 0) problems.push(`${plan.id}: empty request`);
    if (plan.items.length > size) problems.push(`${plan.id}: ${plan.items.length} images exceed the ${size} per request limit`);
    if (plan.items.some((item, i) => item.position !== i + 1)) problems.push(`${plan.id}: positions are not contiguous from 1`);
    if (plan.cols * plan.rows < plan.items.length) problems.push(`${plan.id}: a ${plan.cols}×${plan.rows} grid cannot hold ${plan.items.length} images`);
    if (plan.emptyCells !== plan.cols * plan.rows - plan.items.length) problems.push(`${plan.id}: empty-cell count does not match its grid`);
  }
  return problems;
}

/** One finished request, as the run and the UI both report it. */
export interface BatchOutcome {
  id: string;
  /** 1-based request index within the run. */
  index: number;
  /** Images the request carried. */
  count: number;
  /**
   * "failed" when the request itself failed with a confirmed reason; "unknown"
   * when its outcome could not be confirmed at all (a stall — the provider may
   * still be working), which must never be reported as a plain failure.
   */
  status: "done" | "failed" | "unknown";
  saved: number;
  failed: number;
  missing: number;
  usage: Usage;
  cost: CostInfo;
  /** Redacted reason when the request failed; null after an answer. */
  error: string | null;
  /** Wall-clock time the request was in flight, for the run's own record. */
  elapsedMs: number;
}

export interface OutcomeInput {
  plan: BatchPlan;
  index: number;
  model: string;
  saved: number;
  failed: number;
  missing: number;
  usage: Usage;
  error: string | null;
  /** true when the error means "no confirmed outcome" rather than a failure. */
  unknown?: boolean;
  elapsedMs?: number;
}

/** The outcome of one request: counts, tokens and the one cost decision. */
export function batchOutcome(input: OutcomeInput): BatchOutcome {
  const { plan, usage } = input;
  return {
    id: plan.id,
    index: input.index,
    count: plan.items.length,
    status: input.error === null ? "done" : input.unknown === true ? "unknown" : "failed",
    saved: input.saved,
    failed: input.failed,
    missing: input.missing,
    usage,
    cost: costInfoFor(input.model, usage),
    error: input.error,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs ?? 0)),
  };
}
