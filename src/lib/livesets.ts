// livesets.ts — a growing set of grid cells with incremental connectivity.
// Owns: the union-find over cells as they are added in an arbitrary order, each
// component's summed ink, and the "≥ 1.5 % of the largest component" validity
// count (RULE 1/3: pure arrays in, numbers out; no detector knowledge beyond a
// rect grid).
//
// Used by mergeseries.ts: sweeping cells in ascending distance to ink and asking
// for the valid count at each radius is the same answer `detect` used to get by
// dilating and labelling the mask once per radius.

import type { Grid } from "./grid";

export interface LiveSets {
  /** Adds a cell (an ink cell starts a component, an empty one just bridges). */
  add(p: number): void;
  /** Joins `p` with its 8-neighbours that are already in the set. */
  joinNeighbours(p: number): void;
  /** Components whose ink reaches 1.5 % of the largest one. */
  validCount(): number;
  /** Component id of `p` — stable for the life of the set, useful in tests. */
  root(p: number): number;
  /** Summed ink of `p`'s component. */
  inkOf(p: number): number;
}

/** A component counts only if its ink reaches this share of the largest one. */
const VALID_INK_FRACTION = 0.015;

interface LiveState {
  gw: number;
  gh: number;
  cellInk: Uint32Array;
  parent: Int32Array;
  size: Int32Array;
  ink: Int32Array;
  added: Uint8Array;
  /** Component roots currently alive, so validity costs O(roots), not O(cells). */
  roots: Int32Array;
  pos: Int32Array;
  live: number;
}

export function createLiveSets(grid: Grid, cellInk: Uint32Array): LiveSets {
  const s = createState(grid, cellInk);
  return {
    add: (p) => addCell(s, p),
    joinNeighbours: (p) => joinCellNeighbours(s, p),
    validCount: () => validCount(s),
    root: (p) => findRoot(s, p),
    inkOf: (p) => s.ink[findRoot(s, p)],
  };
}

function createState({ gw, gh }: Grid, cellInk: Uint32Array): LiveState {
  const n = gw * gh;
  const parent = new Int32Array(n);
  for (let p = 0; p < n; p++) parent[p] = p;
  return {
    gw, gh, cellInk,
    parent,
    size: new Int32Array(n),
    ink: new Int32Array(n),
    added: new Uint8Array(n),
    roots: new Int32Array(n),
    pos: new Int32Array(n),
    live: 0,
  };
}

function findRoot(s: LiveState, x: number): number {
  let root = x;
  while (s.parent[root] !== root) {
    s.parent[root] = s.parent[s.parent[root]]; // path halving
    root = s.parent[root];
  }
  return root;
}

function addCell(s: LiveState, p: number): void {
  if (s.added[p]) return;
  s.added[p] = 1;
  s.parent[p] = p;
  s.size[p] = 1;
  s.ink[p] = s.cellInk[p];
  addRoot(s, p);
}

function addRoot(s: LiveState, p: number): void {
  s.pos[p] = s.live;
  s.roots[s.live++] = p;
}

/** Removes a root that just lost a join, in O(1) — `pos` is the swap-remove index. */
function dropRoot(s: LiveState, p: number): void {
  const at = s.pos[p];
  const last = s.roots[--s.live];
  s.roots[at] = last;
  s.pos[last] = at;
}

function joinRoots(s: LiveState, a: number, b: number): void {
  const ra = findRoot(s, a);
  const rb = findRoot(s, b);
  if (ra === rb) return;
  const big = s.size[ra] >= s.size[rb] ? ra : rb;
  const small = big === ra ? rb : ra;
  s.parent[small] = big;
  s.size[big] += s.size[small];
  s.ink[big] += s.ink[small];
  dropRoot(s, small);
}

function joinCellNeighbours(s: LiveState, p: number): void {
  const x = p % s.gw;
  const y = (p / s.gw) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= s.gh) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= s.gw) continue;
      const q = ny * s.gw + nx;
      if (q !== p && s.added[q]) joinRoots(s, p, q);
    }
  }
}

function validCount(s: LiveState): number {
  let maxInk = 0;
  for (let i = 0; i < s.live; i++) {
    const v = s.ink[s.roots[i]];
    if (v > maxInk) maxInk = v;
  }
  let valid = 0;
  const floor = maxInk * VALID_INK_FRACTION;
  for (let i = 0; i < s.live; i++) {
    const v = s.ink[s.roots[i]];
    if (v > 0 && v >= floor) valid++;
  }
  return valid;
}
