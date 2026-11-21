// panelcounts.ts — pure single-pass row counters and O(1)-lookup sets for SvgPanel.
import { shownVersion } from "./rowmodel";
import type { SvgRow } from "./types";

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

export interface SvgRowIndex {
  counts: SvgCounts;
  knownIds: ReadonlySet<string>;
  decidableIds: ReadonlySet<string>;
  generatedIds: ReadonlySet<string>;
  corrupt: number;
  running: number;
  issues: number;
}

const addBool = (n: number, cond: boolean): number => (cond ? n + 1 : n);

/** Single-pass index over `rows`: reads `r.status` once per row and derives all counts and id sets in O(N). */
export function indexSvgRows(rows: readonly SvgRow[]): SvgRowIndex {
  let generated = 0, approved = 0, failed = 0, corrupt = 0, running = 0, issues = 0;
  const knownIds = new Set<string>();
  const decidableIds = new Set<string>();
  const generatedIds = new Set<string>();
  for (const r of rows) {
    const id = r.source.id;
    const status = r.status;
    const isFailed = status === "failed";
    knownIds.add(id);
    generated = addBool(generated, status === "generated");
    approved = addBool(approved, r.review === "approved");
    failed = addBool(failed, isFailed);
    corrupt = addBool(corrupt, r.corrupt);
    running = addBool(running, r.running);
    issues = addBool(issues, isFailed || r.corrupt);
    if (shownVersion(r) !== null) decidableIds.add(id);
    if (r.newest !== null) generatedIds.add(id);
  }
  return {
    counts: { eligible: rows.length, generated, approved, failed },
    knownIds, decidableIds, generatedIds, corrupt, running, issues,
  };
}

/** Counts how many `ids` belong to `set` in O(|ids|). */
export function countInSet(ids: readonly string[], set: ReadonlySet<string>): number {
  let count = 0;
  for (const id of ids) if (set.has(id)) count += 1;
  return count;
}

/** The four counters above the list, in ONE pass reading `r.status` once per row. */
export function countsOf(rows: readonly SvgRow[]): SvgCounts {
  let generated = 0, approved = 0, failed = 0;
  for (const r of rows) {
    const status = r.status;
    if (status === "generated") generated += 1;
    if (r.review === "approved") approved += 1;
    if (status === "failed") failed += 1;
  }
  return { eligible: rows.length, generated, approved, failed };
}

/** Selected rows that actually have a valid SVG to approve or decline. */
export function decidableCount(rows: readonly SvgRow[], affected: readonly string[]): number {
  return affected.length === 0 ? 0 : countInSet(affected, indexSvgRows(rows).decidableIds);
}

/** Selected rows in the list — any row can be declined, even before an SVG exists. */
export function declinableCount(rows: readonly SvgRow[], affected: readonly string[]): number {
  return affected.length === 0 ? 0 : countInSet(affected, indexSvgRows(rows).knownIds);
}
