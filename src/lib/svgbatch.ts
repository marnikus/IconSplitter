// svgbatch.ts — batch planning for composite SVG requests (prompt §2/§3).
// Owns: deterministic batch order, the batch-local position id (1-based, never
// a list index), the smallest square grid that fits a batch, and the manifest
// the provider receives. Stable source ids travel beside the position so a
// result can always be mapped back to its file.

import { clampImagesPerRequest } from "./svgconfig";
import type { BatchRef } from "./svgfile";

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

/**
 * The batch reference one saved version records: which batch it came from,
 * which position inside it, and the manifest that was sent. The runner no
 * longer builds this by hand — the manifest is the one the batch already has.
 */
export function batchRefOf(plan: BatchPlan, position: number, compositeHash: string): BatchRef {
  const manifest = plan.items.map((m) => `${m.position} — ${m.name}`).join("\n");
  return { batchId: plan.id, position, compositeHash, manifest };
}

/** Row/column of a position in the grid (0-based), reading order. */
export function cellOf(position: number, cols: number): { row: number; col: number } {
  const i = Math.max(0, position - 1);
  return { row: Math.floor(i / cols), col: i % cols };
}
