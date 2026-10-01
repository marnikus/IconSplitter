// selectionhistory.ts (batch) — reversible row-checkbox state for the batch
// review window (request §3: checkbox changes and bulk actions; §8: entries
// whose owner only exists while the panel is mounted are ephemeral and never
// written to storage). Pure: the entry payload and its application are here so
// useBatch can stay a wiring layer and the rules stay unit-tested.

import { entry, type HistoryEntry } from "../lib/history";
import { BATCH_SELECT_KIND } from "../history/kinds";
import { checkboxLabel } from "../lib/reviewlabels";
import type { Row } from "./useBatch";

export const BATCH_TAB = "batch";

/** Rows a selection command may touch (missing/deleted sources never count). */
export function selectableKeys(rows: readonly Row[]): string[] {
  return rows.filter((r) => r.status !== "missing" && r.status !== "deleted").map((r) => r.relPath);
}

export function selectedKeys(rows: readonly Row[]): string[] {
  return rows.filter((r) => r.selected).map((r) => r.relPath);
}

/** One checkbox click = one ephemeral entry. */
export function toggleEntry(rows: readonly Row[], relPath: string): HistoryEntry | null {
  const row = rows.find((r) => r.relPath === relPath);
  if (!row) return null;
  const before = selectedKeys(rows);
  const after = row.selected ? before.filter((k) => k !== relPath) : [...before, relPath];
  return entry({
    kind: BATCH_SELECT_KIND, label: checkboxLabel(!row.selected, row.name), tab: BATCH_TAB,
    targets: [relPath], before: { selected: before }, after: { selected: after }, ephemeral: true,
  });
}

/** Select/deselect every selectable row as ONE entry (bulk rule, request §3). */
export function selectAllEntry(rows: readonly Row[], on: boolean): HistoryEntry {
  const keys = selectableKeys(rows);
  const touched = new Set(keys);
  const before = selectedKeys(rows);
  const after = on ? [...new Set([...before, ...keys])] : before.filter((k) => !touched.has(k));
  return entry({
    kind: BATCH_SELECT_KIND, label: `${on ? "Select" : "Deselect"} all batch rows (${keys.length})`, tab: BATCH_TAB,
    targets: keys, before: { selected: before }, after: { selected: after }, ephemeral: true,
  });
}

/** Applies a stored/undone selection payload to the current rows. */
export function applySelection(rows: readonly Row[], payload: unknown): Row[] {
  const selected = new Set(readSelected(payload));
  return rows.map((r) => ({ ...r, selected: selected.has(r.relPath) }));
}

export function readSelected(payload: unknown): string[] {
  const x = payload as { selected?: unknown } | null;
  return Array.isArray(x?.selected) ? x.selected.filter((k): k is string => typeof k === "string") : [];
}
