// batchselect.ts — pure helpers for Batch folders selection, extracted for reuse & testability
// No IO, no React, 100% pure. Used by useBatchSelection and BatchSourceBar.

export type BatchRowLite = { relPath: string; status: string; selected?: boolean };

export function selectableRows(rows: BatchRowLite[]): BatchRowLite[] {
  return rows.filter((r) => r.status !== "missing" && r.status !== "deleted");
}

export function selectableIds(rows: BatchRowLite[]): string[] {
  return selectableRows(rows).map((r) => r.relPath);
}

export function toLowerSet(ids: readonly string[]): Set<string> {
  return new Set(ids.map((id) => id.toLowerCase()));
}

export function isRowSelected(rows: BatchRowLite[], rel: string): boolean {
  const r = rows.find((x) => x.relPath.toLowerCase() === rel.toLowerCase()) as { selected?: boolean } | undefined;
  return !!r?.selected;
}

export function selectionLabel(ids: string[]): string {
  if (ids.length === 0) return "Clear selection";
  return ids.length === 1 ? "Select a row" : `Select ${ids.length} rows`;
}

export interface BatchCounters {
  total: number;
  unprocessed: number;
  processed: number;
  skipped: number;
  changed: number;
}

export function batchCounters(rows: { status: string }[]): BatchCounters {
  const total = rows.length;
  let unprocessed = 0;
  let processed = 0;
  let skipped = 0;
  let changed = 0;
  for (const r of rows) {
    if (r.status === "unprocessed") unprocessed++;
    else if (r.status === "processed") processed++;
    else if (r.status === "skipped") skipped++;
    else if (r.status === "changed") changed++;
  }
  return { total, unprocessed, processed, skipped, changed };
}
