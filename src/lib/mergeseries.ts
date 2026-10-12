// mergeseries.ts — how many icons a merge radius finds, in ONE sweep instead of
// one dilate+label run per radius. Owns: the exact chessboard distance transform
// from every grid cell to the nearest ink cell, the ascending distance buckets,
// and the walk that replays the detector's series with them (RULE 1/3: pixel math
// in lib, pure arrays in, pure numbers out).
//
// Why it exists (docs/archive/2026-10-12-batch-preview-splits/design.md, D1):
// `detect` used to find its automatic radius by running the whole dilate+label
// pipeline once per candidate radius — 51–80 runs per image, measured at
// 84–543 ms on one sheet, which is what made a 1000-row Batch preview freeze the
// tab. Dilating ink by radius r is exactly `{cell : distance(cell, ink) <= r}`,
// so the components per radius are the components of the thresholded distance
// field: one transform plus one increasing-radius walk yields the same numbers.
// The output is bit-identical — locked by tests/detect_equivalence.test.ts against
// a frozen copy of the pre-change detector.
//
// What stays in detect.ts: the final dilate+label at the chosen radius and the
// full-resolution box pass, so box coordinates cannot drift from this file.

import type { Grid } from "./grid";
import { createLiveSets, type LiveSets } from "./livesets";

/** Sentinel meaning "no ink cell reaches here yet" during the two sweeps. */
const UNREACHED = 0x3fffffff;

/** What the series needs of a grid: which cells hold ink, and how much. */
export interface SeriesInput extends Grid {
  cells: Uint8Array;
  counts: Uint32Array;
}

export interface DistanceBuckets {
  /** Cell indices ordered by ascending distance (only distances <= limit). */
  order: Int32Array;
  /** `start[d] .. start[d + 1]` is bucket d's slice of `order`; the last entry is the end. */
  start: Uint32Array;
  /** The largest distance actually present, never above the limit. */
  maxPresent: number;
}

/** Component count for radii 1..rMax — the detector's series, in one pass. */
export function componentCountSeries(input: SeriesInput, rMax: number): number[] {
  const dist = distanceToInk(input.cells, input.gw, input.gh);
  if (!dist) return new Array<number>(rMax).fill(0); // no ink: honest empty (RULE 4)
  const reach = Math.min(maxDistance(dist), rMax);
  const buckets = cellsByDistance(dist, reach);
  const live = createLiveSets(input, input.counts);
  return extendToRMax(walkSeries(buckets, live, reach), rMax, reach);
}

/** A radius beyond the farthest cell cannot change the set: the last count holds. */
function extendToRMax(series: number[], rMax: number, reach: number): number[] {
  const out = new Array<number>(rMax);
  for (let r = 1; r <= rMax; r++) out[r - 1] = series[Math.min(r, reach) - 1];
  return out;
}

/** Chessboard distance of every cell to the nearest ink cell; null when no cell has ink. */
export function distanceToInk(cells: Uint8Array, gw: number, gh: number): Int32Array | null {
  if (!cells.includes(1)) return null;
  const dist = seedDistances(cells);
  sweepForward(dist, gw, gh);
  sweepBackward(dist, gw, gh);
  return dist;
}

function seedDistances(cells: Uint8Array): Int32Array {
  const dist = new Int32Array(cells.length);
  for (let p = 0; p < cells.length; p++) dist[p] = cells[p] ? 0 : UNREACHED;
  return dist;
}

function maxDistance(dist: Int32Array): number {
  let max = 0;
  for (let p = 0; p < dist.length; p++) if (dist[p] > max) max = dist[p];
  return max;
}

function sweepForward(dist: Int32Array, gw: number, gh: number): void {
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const p = y * gw + x;
      if (dist[p] === 0) continue; // ink itself
      const best = minAboveLeft(dist, gw, p);
      dist[p] = best >= UNREACHED ? UNREACHED : best + 1;
    }
  }
}

/** Smallest distance among the cells the forward pass has already settled. */
function minAboveLeft(dist: Int32Array, gw: number, p: number): number {
  const x = p % gw;
  let best = dist[p];
  if (p - gw >= 0) {
    best = Math.min(best, dist[p - gw]);
    if (x > 0) best = Math.min(best, dist[p - gw - 1]);
    if (x + 1 < gw) best = Math.min(best, dist[p - gw + 1]);
  }
  if (x > 0) best = Math.min(best, dist[p - 1]);
  return best;
}

function sweepBackward(dist: Int32Array, gw: number, gh: number): void {
  for (let y = gh - 1; y >= 0; y--) {
    for (let x = gw - 1; x >= 0; x--) {
      const p = y * gw + x;
      if (dist[p] === 0) continue;
      const step = minBelowRight(dist, gw, p) + 1;
      if (step < dist[p]) dist[p] = step;
    }
  }
}

/** Smallest distance among the cells the backward pass has already settled. */
function minBelowRight(dist: Int32Array, gw: number, p: number): number {
  const x = p % gw;
  let best = dist[p];
  if (p + gw < dist.length) {
    best = Math.min(best, dist[p + gw]);
    if (x > 0) best = Math.min(best, dist[p + gw - 1]);
    if (x + 1 < gw) best = Math.min(best, dist[p + gw + 1]);
  }
  if (x + 1 < gw) best = Math.min(best, dist[p + 1]);
  return best;
}

/** Cells grouped by distance, ascending — the walk visits them bucket by bucket. */
export function cellsByDistance(dist: Int32Array, limit: number): DistanceBuckets {
  const sizes = new Uint32Array(limit + 2);
  for (let p = 0; p < dist.length; p++) if (dist[p] <= limit) sizes[dist[p]]++;
  const start = prefixSums(sizes);
  const order = new Int32Array(start[limit + 1]);
  const cursor = start.slice(0, limit + 1);
  let maxPresent = 0;
  for (let p = 0; p < dist.length; p++) {
    const d = dist[p];
    if (d > limit) continue;
    order[cursor[d]++] = p;
    if (d > maxPresent) maxPresent = d;
  }
  return { order, start, maxPresent };
}

function prefixSums(sizes: Uint32Array): Uint32Array {
  const start = new Uint32Array(sizes.length);
  for (let d = 0; d + 1 < sizes.length; d++) start[d + 1] = start[d] + sizes[d];
  return start;
}

/** Series for radii 1..reach: the live set grows bucket by bucket and is asked each step. */
function walkSeries(buckets: DistanceBuckets, live: LiveSets, reach: number): number[] {
  const series = new Array<number>(reach);
  for (let d = 0; d <= reach; d++) {
    addBucket(buckets, live, d);
    if (d > 0) series[d - 1] = live.validCount();
  }
  return series;
}

/** Adds bucket d, then joins it: cells must all be present before neighbours are looked up. */
function addBucket(buckets: DistanceBuckets, live: LiveSets, d: number): void {
  const from = buckets.start[d];
  const to = buckets.start[d + 1];
  for (let i = from; i < to; i++) live.add(buckets.order[i]);
  for (let i = from; i < to; i++) live.joinNeighbours(buckets.order[i]);
}
