// reviewsort.ts — pure ordering for the Selection review list (RULE 3/8).
// Sort modes: date / status / name / path, both directions; ties always break
// on pairId so ordering is deterministic (RULE 22-style stability).

import type { ViewPair, Decision } from "./reviewfilter";
import { sortByFlag, stateOrderOptions } from "./statesort";
import { isRecord } from "./isrecord";

export interface SortState {
  by: "selected" | "approval" | "date" | "status" | "name" | "path";
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { by: "date", dir: "desc" };

const STATUS_RANK: Record<Decision, number> = { pending: 0, approved: 1, declined: 2 };

export function sortPairs(pairs: ViewPair[], s: SortState, checked: readonly string[] = []): ViewPair[] {
  if (s.by === "selected" || s.by === "approval") {
    const selected = new Set(checked);
    const ordered = sortPairs(pairs, { by: "path", dir: "asc" });
    return sortByFlag(ordered, (r) => s.by === "selected"
      ? selected.has(r.pairId) : r.decision === "approved", s.dir === "desc");
  }
  const sign = s.dir === "asc" ? 1 : -1;
  const by = s.by;
  return [...pairs].sort((a, b) => compare(a, b, by, sign));
}

function compare(a: ViewPair, b: ViewPair, by: Exclude<SortState["by"], "selected" | "approval">, sign: number): number {
  const primary = primaryCmp(a, b, by);
  if (primary !== 0) return sign * primary;
  if (by === "status") {
    const tie = b.created - a.created; // same status -> newest first
    if (tie !== 0) return tie;
  }
  return a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0;
}

function primaryCmp(a: ViewPair, b: ViewPair, by: Exclude<SortState["by"], "selected" | "approval">): number {
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

const SORT_KEYS: SortState["by"][] = ["selected", "approval", "date", "status", "name", "path"];

/** Stored sort → SortState; anything unusable yields DEFAULT_SORT (RULE 13). */
export function parseSort(raw: unknown): SortState {
  if (!isRecord(raw)) return DEFAULT_SORT;
  return {
    by: SORT_KEYS.includes(raw.by as SortState["by"]) ? (raw.by as SortState["by"]) : DEFAULT_SORT.by,
    dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : DEFAULT_SORT.dir,
  };
}

/** "Sort: name (A→Z)" — the words a history entry shows for a sort change. */
export function sortLabel(s: SortState): string {
  if (s.by === "selected" || s.by === "approval") {
    const order = stateOrderOptions(s.by).find(([value]) => value === s.dir)![1];
    return `Sort: ${s.by} (${order})`;
  }
  return `Sort: ${s.by} (${s.dir === "asc" ? "A→Z" : "Z→A"})`;
}
