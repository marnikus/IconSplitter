// reviewsort.ts — pure ordering for the Selection review list (RULE 3/8).
// Sort modes: date / status / name / path, both directions; ties always break
// on pairId so ordering is deterministic (RULE 22-style stability).

import type { ViewPair, Decision } from "./reviewfilter";

export interface SortState {
  by: "date" | "status" | "name" | "path";
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { by: "date", dir: "desc" };

const STATUS_RANK: Record<Decision, number> = { pending: 0, approved: 1, declined: 2 };

export function sortPairs(pairs: ViewPair[], s: SortState): ViewPair[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...pairs].sort((a, b) => compare(a, b, s.by, sign));
}

function compare(a: ViewPair, b: ViewPair, by: SortState["by"], sign: number): number {
  const primary = primaryCmp(a, b, by);
  if (primary !== 0) return sign * primary;
  if (by === "status") {
    const tie = b.created - a.created; // same status -> newest first
    if (tie !== 0) return tie;
  }
  return a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0;
}

function primaryCmp(a: ViewPair, b: ViewPair, by: SortState["by"]): number {
  switch (by) {
    case "date": return a.created - b.created;
    case "status": return STATUS_RANK[a.decision] - STATUS_RANK[b.decision];
    case "name": return ci(a.base, b.base);
    case "path": return ci(`${a.relDir}/${a.base}`, `${b.relDir}/${b.base}`);
  }
}

function ci(x: string, y: string): number {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}
