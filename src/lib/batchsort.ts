// batchsort.ts — pure ordering for Batch folders + review (RULE 3/8)
// Sort modes: date / name / path / status / review, both directions; ties break on relPath.

import type { SourceStatus, BatchReviewStatus } from "./statefile";
import { sortByFlag, stateOrderOptions } from "./statesort";
import { isRecord } from "./isrecord";

export interface BatchSort {
  by: "selected" | "approval" | "date" | "name" | "path" | "status" | "review";
  dir: "asc" | "desc";
}

export const DEFAULT_BATCH_SORT: BatchSort = { by: "date", dir: "desc" };

const STATUS_RANK: Record<SourceStatus, number> = {
  unprocessed: 0,
  processed: 1,
  skipped: 2,
  changed: 3,
  missing: 4,
  deleted: 5,
};

const REVIEW_RANK: Record<BatchReviewStatus, number> = {
  approved: 0,
  warning: 1,
  pending: 2,
  declined: 3,
};

export interface BatchSortable {
  mtime: number;
  name: string;
  relPath: string;
  dirPath: string;
  status: SourceStatus;
  review?: BatchReviewStatus;
}

export function sortBatchRows<T extends BatchSortable>(rows: T[], s: BatchSort, checked: readonly string[] = []): T[] {
  if (s.by === "selected" || s.by === "approval") {
    const selected = new Set(checked.map((id) => id.toLowerCase()));
    const ordered = sortBatchRows(rows, { by: "path", dir: "asc" });
    return sortByFlag(ordered, (r) => s.by === "selected"
      ? selected.has(r.relPath.toLowerCase()) : r.review === "approved", s.dir === "desc");
  }
  const sign = s.dir === "asc" ? 1 : -1;
  const by = s.by;
  return [...rows].sort((a, b) => cmp(a, b, by, sign));
}

function cmp(a: BatchSortable, b: BatchSortable, by: Exclude<BatchSort["by"], "selected" | "approval">, sign: number): number {
  const primary = primaryCmp(a, b, by);
  if (primary !== 0) return sign * primary;
  if (by === "status" || by === "review") {
    const tie = b.mtime - a.mtime;
    if (tie !== 0) return tie;
  }
  return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
}

function primaryCmp(a: BatchSortable, b: BatchSortable, by: Exclude<BatchSort["by"], "selected" | "approval">): number {
  switch (by) {
    case "date": return a.mtime - b.mtime;
    case "name": return ci(a.name, b.name);
    case "path": return ci(`${a.dirPath}/${a.name}`, `${b.dirPath}/${b.name}`);
    case "status": return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    case "review": return REVIEW_RANK[a.review ?? "pending"] - REVIEW_RANK[b.review ?? "pending"];
  }
}

function ci(x: string, y: string): number {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

const SORT_KEYS: BatchSort["by"][] = ["selected", "approval", "date", "name", "path", "status", "review"];

export function parseBatchSort(raw: unknown): BatchSort {
  if (!isRecord(raw)) return DEFAULT_BATCH_SORT;
  return {
    by: SORT_KEYS.includes(raw.by as BatchSort["by"]) ? (raw.by as BatchSort["by"]) : DEFAULT_BATCH_SORT.by,
    dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : DEFAULT_BATCH_SORT.dir,
  };
}

export function batchSortLabel(s: BatchSort): string {
  if (s.by === "selected" || s.by === "approval") {
    const order = stateOrderOptions(s.by).find(([value]) => value === s.dir)![1];
    return `Sort: ${s.by} (${order})`;
  }
  return `Sort: ${s.by} (${s.dir === "asc" ? "A→Z" : "Z→A"})`;
}
