// rowlist.ts — the list VIEW of the upload rows (design §2.6): the derived
// list row one filter reads, the filters themselves, the sort, the visible
// subset and the header-checkbox state. Pure functions over the rows; the
// assembly and the counts stay in rowmodel.

import { compareNames } from "../lib/scan";
import type {
  UploadListFilter, UploadListRow, UploadRow, UploadSort,
} from "./types";

export function toListRow(row: UploadRow): UploadListRow {
  return {
    id: row.source.id,
    name: row.source.svgName,
    relPath: row.source.svgPath,
    status: row.record === null ? "not-exported" : row.stale ? "stale" : (row.record.status as UploadListRow["status"]),
    metadata: row.meta.state,
    approvedValid: row.source.approvedValid,
  };
}

export function applyUploadFilters(rows: readonly UploadListRow[], f: UploadListFilter): UploadListRow[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => inStatus(r, f.status) && inMeta(r, f.metadata) && inSearch(r, needle));
}

function inStatus(row: UploadListRow, want: UploadListFilter["status"]): boolean {
  return want === "all" || row.status === want;
}

function inMeta(row: UploadListRow, want: UploadListFilter["metadata"]): boolean {
  return want === "all" || row.metadata === want;
}

function inSearch(row: UploadListRow, needle: string): boolean {
  if (needle === "") return true;
  return `${row.name} ${row.relPath} v${row.approvedValid}`.toLowerCase().includes(needle);
}

/** Sorts a copy — the caller's array is never reordered. */
export function sortUploadRows(rows: readonly UploadListRow[], sort: UploadSort): UploadListRow[] {
  const out = [...rows];
  out.sort((a, b) => COMPARATORS[sort](a, b));
  return out;
}

const COMPARATORS: Record<UploadSort, (a: UploadListRow, b: UploadListRow) => number> = {
  name: (a, b) => compareNames(a.relPath, b.relPath) || compareNames(a.id, b.id),
  status: (a, b) => rank(a.status) - rank(b.status) || compareNames(a.relPath, b.relPath),
  metadata: (a, b) => rank(a.metadata) - rank(b.metadata) || compareNames(a.relPath, b.relPath),
};

const STATUS_RANK: Record<UploadListRow["status"], number> = {
  all: 0, failed: 1, cancelled: 2, partial: 3, stale: 4, "not-exported": 5, processed: 6,
};
const META_RANK: Record<UploadListRow["metadata"], number> = {
  all: 0, invalid: 1, interrupted: 2, pending: 3, empty: 4, generated: 5, accepted: 6,
};

function rank(value: string): number {
  return STATUS_RANK[value as UploadListRow["status"]] ?? META_RANK[value as UploadListRow["metadata"]] ?? 0;
}

/** Filter + sort a copy of the rows; the caller's array is never reordered. */
export function visibleRows(rows: readonly UploadRow[], filter: UploadListFilter, sort: UploadSort): UploadRow[] {
  const byId = new Map(rows.map((r) => [r.source.id, r]));
  return sortUploadRows(applyUploadFilters([...byId.values()].map(toListRow), filter), sort)
    .flatMap((l) => {
      const row = byId.get(l.id);
      return row ? [row] : [];
    });
}

/** Header checkbox state for the visible rows (indeterminate = some). */
export function headerState(visible: readonly UploadRow[], checked: readonly string[]): "none" | "some" | "all" {
  if (visible.length === 0) return "none";
  const on = visible.filter((r) => checked.includes(r.source.id)).length;
  if (on === 0) return "none";
  return on === visible.length ? "all" : "some";
}

/** The counters the source bar shows, straight off the rows (no extra state). */


/** The counters the source bar shows, straight off the rows (no extra state). */
