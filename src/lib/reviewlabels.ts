// reviewlabels.ts — the ONE owner of undo/redo label text (request §6/§7,
// RULE 10). Labels name the action and its scope so a tooltip like
// "Undo: Approve 14 selected pairs" is always truthful, and so a bulk command
// never reads as a single-item command.

import type { Decision, ListFilter } from "./reviewfilter";
import type { SortState } from "./reviewsort";

/** "Approve 14 pairs" / "Approve “fog”" / "Reset 1 pair to pending". */
export function decisionLabel(decision: Decision, count: number, subject?: string): string {
  if (count === 1 && subject) return `${verb(decision)} “${subject}”`;
  const pairs = `${count} pair${count === 1 ? "" : "s"}`;
  if (decision === "approved") return `Approve ${pairs}`;
  if (decision === "declined") return `Decline ${pairs}`;
  return `Reset ${pairs} to pending`;
}

function verb(decision: Decision): string {
  if (decision === "approved") return "Approve";
  return decision === "declined" ? "Decline" : "Reset";
}

/** "Check “fog”" / "Uncheck “fog”" for one row's checkbox. */
export function checkLabel(on: boolean, subject: string): string {
  return `${on ? "Check" : "Uncheck"} “${subject}”`;
}

/** The same wording for any review surface's checkbox (batch rows included). */
export const checkboxLabel = checkLabel;

/** "Select visible (7 pairs)" / "Deselect all (12 pairs)" for a bulk scope. */
export function bulkCheckLabel(scope: "visible" | "all", on: boolean, count: number): string {
  const pairs = `${count} pair${count === 1 ? "" : "s"}`;
  if (scope === "visible") return `Select visible (${pairs})`;
  return `${on ? "Select" : "Deselect"} all (${pairs})`;
}

/** "Filter: status = approved", "Sort: name (asc)", "Zoom: 128 px". */
export function viewLabel(field: string, value: string): string {
  return `${field}: ${value}`;
}

/** Compact description of a whole list filter, for the history label. */
export function filterLabel(f: ListFilter): string {
  const parts: string[] = [];
  if (f.date.mode === "month") parts.push(`month ${f.date.month}`);
  if (f.date.mode === "custom") parts.push("custom range");
  if (f.status !== "all") parts.push(f.status);
  if (f.pairing !== "all") parts.push(f.pairing === "complete" ? "complete pairs" : "missing pairs");
  if (f.search.trim()) parts.push(`“${f.search.trim()}”`);
  return viewLabel("Filter", parts.length ? parts.join(" · ") : "cleared");
}

/** "Sort: name (asc)". */
export function sortLabel(s: SortState): string {
  return viewLabel("Sort", `${s.by} (${s.dir})`);
}
