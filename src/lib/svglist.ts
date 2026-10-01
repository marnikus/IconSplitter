// svglist.ts — pure list filtering/sorting for the Generate SVG tab (prompt §2).
// Owns: the generation/review status filters, free-text search and the sort
// orders the template offers. Rows are reduced to the fields the rules need, so
// the logic stays testable without a DOM (RULE 3/8) and the UI keeps no rule.

export type GenFilter = "all" | "not-generated" | "generating" | "generated" | "failed";
export type ReviewFilter = "all" | "pending" | "approved" | "declined";
export type SvgSort = "date" | "name" | "generation" | "review" | "cost";

export interface SvgListFilter {
  generation: GenFilter;
  review: ReviewFilter;
  search: string;
}

export const ALL_SVG_FILTER: SvgListFilter = { generation: "all", review: "all", search: "" };

/** The row fields a filter or sort may look at. */
export interface SvgListRow {
  id: string;
  name: string;
  relPath: string;
  generation: GenFilter;
  review: ReviewFilter;
  /** Newest generation timestamp in epoch ms, or null when never generated. */
  generatedAt: number | null;
  /** Actual provider-reported cost of the newest version, or null. */
  cost: number | null;
  /** Total tokens of the newest version, or null when not reported. */
  tokens: number | null;
  version: number;
}

export function applySvgFilters(rows: readonly SvgListRow[], f: SvgListFilter): SvgListRow[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => inGeneration(r, f.generation) && inReview(r, f.review) && inSearch(r, needle));
}

function inGeneration(row: SvgListRow, want: GenFilter): boolean {
  return want === "all" || row.generation === want;
}

function inReview(row: SvgListRow, want: ReviewFilter): boolean {
  return want === "all" || row.review === want;
}

function inSearch(row: SvgListRow, needle: string): boolean {
  if (needle === "") return true;
  return `${row.relPath} v${row.version} ${row.generation} ${row.review}`.toLowerCase().includes(needle);
}

/** Sorts a copy — the caller's array is never reordered in place. */
export function sortSvgRows(rows: readonly SvgListRow[], sort: SvgSort): SvgListRow[] {
  const out = [...rows];
  out.sort((a, b) => compare(a, b, sort));
  return out;
}

/** One comparator per sort order, so adding an order never deepens a branch. */
const COMPARATORS: Record<SvgSort, (a: SvgListRow, b: SvgListRow) => number> = {
  name: (a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0),
  cost: (a, b) => (b.cost ?? -1) - (a.cost ?? -1),
  date: (a, b) => (b.generatedAt ?? 0) - (a.generatedAt ?? 0),
  review: (a, b) => rank(a.review) - rank(b.review),
  generation: (a, b) => rank(a.generation) - rank(b.generation),
};

function compare(a: SvgListRow, b: SvgListRow, sort: SvgSort): number {
  return COMPARATORS[sort](a, b);
}

const REVIEW_RANK: Record<ReviewFilter, number> = { all: 0, pending: 1, approved: 2, declined: 3 };
const GEN_RANK: Record<GenFilter, number> = { all: 0, "not-generated": 1, generating: 2, generated: 3, failed: 4 };

function rank(value: string): number {
  return REVIEW_RANK[value as ReviewFilter] ?? GEN_RANK[value as GenFilter] ?? 0;
}

/** "3 of 108 shown" — the honest count line under the list. */
export function shownLabel(shown: number, total: number): string {
  return `Showing ${shown} of ${total} approved sources`;
}

/** Totals for the footer: tokens and actual cost across the visible rows. */
export interface UsageTotals {
  tokens: number | null;
  cost: number | null;
  generated: number;
  approved: number;
  failed: number;
}

export function usageTotals(rows: readonly SvgListRow[]): UsageTotals {
  const totals = { tokens: 0, cost: 0, generated: 0, approved: 0, failed: 0, anyTokens: false, anyCost: false };
  for (const r of rows) countRow(totals, r);
  return {
    tokens: totals.anyTokens ? totals.tokens : null,
    cost: totals.anyCost ? totals.cost : null,
    generated: totals.generated,
    approved: totals.approved,
    failed: totals.failed,
  };
}

function countRow(t: { tokens: number; cost: number; generated: number; approved: number; failed: number; anyTokens: boolean; anyCost: boolean }, r: SvgListRow): void {
  if (r.generation === "generated") t.generated++;
  if (r.generation === "failed") t.failed++;
  if (r.review === "approved") t.approved++;
  if (r.tokens !== null) {
    t.tokens += r.tokens;
    t.anyTokens = true;
  }
  if (r.cost !== null) {
    t.cost += r.cost;
    t.anyCost = true;
  }
}
