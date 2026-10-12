// batchsort.ts — pure ordering for Batch folders (RULE 3/8)
// Sort modes: date / name / path / status, both directions; ties break on relPath.

import type { SourceStatus } from "./statefile";
import { isRecord } from "./isrecord";

export interface BatchSort {
  by: "date" | "name" | "path" | "status";
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

export interface BatchSortable {
  mtime: number;
  name: string;
  relPath: string;
  dirPath: string;
  status: SourceStatus;
}

export function sortBatchRows<T extends BatchSortable>(rows: T[], s: BatchSort): T[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => cmp(a, b, s.by, sign));
}

function cmp(a: BatchSortable, b: BatchSortable, by: BatchSort["by"], sign: number): number {
  const primary = primaryCmp(a, b, by);
  if (primary !== 0) return sign * primary;
  if (by === "status") {
    const tie = b.mtime - a.mtime;
    if (tie !== 0) return tie;
  }
  return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
}

function primaryCmp(a: BatchSortable, b: BatchSortable, by: BatchSort["by"]): number {
  switch (by) {
    case "date": return a.mtime - b.mtime;
    case "name": return ci(a.name, b.name);
    case "path": return ci(`${a.dirPath}/${a.name}`, `${b.dirPath}/${b.name}`);
    case "status": return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
}

function ci(x: string, y: string): number {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

const SORT_KEYS: BatchSort["by"][] = ["date", "name", "path", "status"];

export function parseBatchSort(raw: unknown): BatchSort {
  if (!isRecord(raw)) return DEFAULT_BATCH_SORT;
  return {
    by: SORT_KEYS.includes(raw.by as BatchSort["by"]) ? (raw.by as BatchSort["by"]) : DEFAULT_BATCH_SORT.by,
    dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : DEFAULT_BATCH_SORT.dir,
  };
}

export function batchSortLabel(s: BatchSort): string {
  return `Sort: ${s.by} (${s.dir === "asc" ? "A→Z" : "Z→A"})`;
}
