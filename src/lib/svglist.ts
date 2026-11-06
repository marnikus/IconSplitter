// svglist.ts — pure list filtering/sorting for the Generate SVG tab (prompt §2).
// Owns: the generation/review status filters, free-text search and the sort
// orders the template offers. Rows are reduced to the fields the rules need, so
// the logic stays testable without a DOM (RULE 3/8) and the UI keeps no rule.

import { isSelectionSort, isStateSort, sortByFlag, type StateSort } from "./statesort";
import { matchesSearch } from "./textsearch";
import { REVIEW_LABEL, type ReviewStatus } from "./svgmodel";

/** The status as people read it ("Regenerate SVG — overlaps"); "all" has none. */
function reviewLabel(review: ReviewFilter): string {
  return review === "all" ? "" : REVIEW_LABEL[review];
}

export type GenFilter = "all" | "not-generated" | "generating" | "generated" | "failed" | "unknown";
export type ReviewFilter = "all" | ReviewStatus;
export type SvgSort =
  | StateSort
  | "date"
  | "name"
  | "generation"
  | "review"
  | "cost"
  /** When the SVG the row shows was created/added (a found file keeps its own time). */
  | "svg-created"
  /** When the AI source the row shows was created. */
  | "ai-created";

/** The one direction control: applies to whichever order and filter is in force. */
export type SvgDir = "asc" | "desc";

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
  /** Newest version's cost: provider-reported when reported, else calculated. */
  cost: number | null;
  /** True when `cost` is a calculated number and must show as Estimated. */
  costEstimated: boolean;
  /** Total tokens of the newest version, or null when not reported. */
  tokens: number | null;
  version: number;
  /** Epoch ms the shown SVG was created/added; null when the row has no SVG. */
  svgCreatedAt: number | null;
  /** Epoch ms the shown AI source was created; null when that cannot be known. */
  aiCreatedAt: number | null;
}

export function applySvgFilters(rows: readonly SvgListRow[], f: SvgListFilter): SvgListRow[] {
  return rows.filter((r) => inGeneration(r, f.generation) && inReview(r, f.review) && inSearch(r, f.search));
}

function inGeneration(row: SvgListRow, want: GenFilter): boolean {
  return want === "all" || row.generation === want;
}

function inReview(row: SvgListRow, want: ReviewFilter): boolean {
  return want === "all" || row.review === want;
}

/** File name, folder, shown version and both status words (lib/textsearch). */
function inSearch(row: SvgListRow, query: string): boolean {
  return matchesSearch(query, [row.name, row.relPath, `v${row.version}`, row.generation, row.review, reviewLabel(row.review)]);
}

/**
 * The pinned order (2026-10-08): ids that were on screen keep their places,
 * newcomers follow in their sorted order, ids that are gone go. A result that
 * lands under "newest first" therefore never moves a row under the cursor; the
 * caller refreshes the pin on a sort change, a scan or a tab re-activation.
 */
export function pinOrder(previous: readonly string[], sorted: readonly string[]): string[] {
  const present = new Set(sorted);
  const kept = previous.filter((id) => present.has(id));
  const seen = new Set(kept);
  return [...kept, ...sorted.filter((id) => !seen.has(id))];
}

/**
 * Each order's own direction: what a user expects when they pick it. The
 * direction control starts here and can then be flipped for ANY order, so the
 * arrow never depends on which sort or filter happens to be selected.
 */
const NATURAL_DIR: Record<SvgSort, SvgDir> = {
  name: "asc",
  generation: "asc",
  review: "asc",
  date: "desc",
  cost: "desc",
  "svg-created": "desc",
  "ai-created": "desc",
  selected: "desc",
  unselected: "desc",
  unapproved: "desc",
  approved: "desc",
};

export function naturalDir(sort: SvgSort): SvgDir {
  return NATURAL_DIR[sort] ?? "desc";
}

/** The direction the user picked, or that order's own direction when they have not. */
export function sortDirOf(sort: SvgSort, dir?: SvgDir | null): SvgDir {
  return dir ?? naturalDir(sort);
}

/**
 * Sorts a copy — the caller's array is never reordered in place. `dir` reverses
 * whichever order is chosen; a row with no timestamp at all is last in BOTH
 * directions (an unknown age is never claimed to be the oldest or the newest),
 * and equal rows fall back to the path so an order is never left to chance.
 */
export function sortSvgRows(
  rows: readonly SvgListRow[], sort: SvgSort, checked: readonly string[] = [], dir?: SvgDir | null,
): SvgListRow[] {
  if (isStateSort(sort)) {
    // A group's own label says which block comes first; the arrow swaps the
    // blocks and never scrambles the readable name order inside one.
    const selected = new Set(checked);
    const own = sort === "selected" || sort === "approved";
    return sortByFlag(baseOrder(rows), (r) => isSelectionSort(sort)
      ? selected.has(r.id) : r.review === "approved", flipped(sort, dir) ? !own : own);
  }
  const out = [...rows];
  out.sort((a, b) => compare(a, b, sort, flipped(sort, dir)));
  return out;
}

/** True when the user's direction is the opposite of the order's own direction. */
function flipped(sort: SvgSort, dir?: SvgDir | null): boolean {
  return dir !== null && dir !== undefined && dir !== naturalDir(sort);
}

/** The base order a grouped sort falls back on: the name, so groups are stable. */
function baseOrder(rows: readonly SvgListRow[]): SvgListRow[] {
  return sortSvgRows(rows, "name");
}

/** One comparator per sort order, so adding an order never deepens a branch. */
const COMPARATORS: Record<Exclude<SvgSort, StateSort>, (a: SvgListRow, b: SvgListRow) => number> = {
  name: (a, b) => comparePath(a, b),
  cost: (a, b) => (b.cost ?? -1) - (a.cost ?? -1),
  date: (a, b) => (b.generatedAt ?? 0) - (a.generatedAt ?? 0),
  "svg-created": (a, b) => timeOrder(a.svgCreatedAt, b.svgCreatedAt),
  "ai-created": (a, b) => timeOrder(a.aiCreatedAt, b.aiCreatedAt),
  review: (a, b) => rank(a.review) - rank(b.review),
  generation: (a, b) => rank(a.generation) - rank(b.generation),
};

/** Newest first for known times; an unknown time is always after a known one. */
function timeOrder(a: number | null, b: number | null): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return b - a;
}

function comparePath(a: SvgListRow, b: SvgListRow): number {
  return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
}

function compare(a: SvgListRow, b: SvgListRow, sort: Exclude<SvgSort, StateSort>, reverse: boolean): number {
  // An unknown time is neither the newest nor the oldest: it stays last.
  if (TIME_SORTS.has(sort)) {
    const unknown = unknownTime(a, b, sort);
    if (unknown !== 0) return unknown;
  }
  const primary = COMPARATORS[sort](a, b);
  if (primary !== 0) return reverse ? -primary : primary;
  // Never left to chance: two equal rows keep a stable, readable order.
  return comparePath(a, b);
}

const TIME_SORTS = new Set<SvgSort>(["svg-created", "ai-created"]);

/** 1 when only `a` has no time, -1 when only `b` has none, 0 when both are known. */
function unknownTime(a: SvgListRow, b: SvgListRow, sort: SvgSort): number {
  const [x, y] = sort === "svg-created" ? [a.svgCreatedAt, b.svgCreatedAt] : [a.aiCreatedAt, b.aiCreatedAt];
  return Number(x === null) - Number(y === null);
}

const REVIEW_RANK: Record<ReviewFilter, number> = { all: 0, pending: 1, approved: 2, declined: 3, "needs-review": 4, "regen-overlaps": 5, "regen-geometry": 6 };
const GEN_RANK: Record<GenFilter, number> = { all: 0, "not-generated": 1, generating: 2, generated: 3, failed: 4, unknown: 5 };

function rank(value: string): number {
  return REVIEW_RANK[value as ReviewFilter] ?? GEN_RANK[value as GenFilter] ?? 0;
}

/** "3 of 108 shown" — the honest count line under the list. */
export function shownLabel(shown: number, total: number): string {
  return `Showing ${shown} of ${total} approved sources`;
}

/** Totals for the footer: tokens, reported cost and estimated cost, never merged. */
export interface UsageTotals {
  tokens: number | null;
  cost: number | null;
  estimated: number | null;
  generated: number;
  approved: number;
  failed: number;
}

interface Parts {
  tokens: number;
  cost: number;
  estimated: number;
  generated: number;
  approved: number;
  failed: number;
  anyTokens: boolean;
  anyCost: boolean;
  anyEstimated: boolean;
}

export function usageTotals(rows: readonly SvgListRow[]): UsageTotals {
  const parts: Parts = { tokens: 0, cost: 0, estimated: 0, generated: 0, approved: 0, failed: 0, anyTokens: false, anyCost: false, anyEstimated: false };
  for (const r of rows) countRow(parts, r);
  return {
    tokens: parts.anyTokens ? parts.tokens : null,
    cost: parts.anyCost ? parts.cost : null,
    estimated: parts.anyEstimated ? parts.estimated : null,
    generated: parts.generated,
    approved: parts.approved,
    failed: parts.failed,
  };
}

function countRow(t: Parts, r: SvgListRow): void {
  if (r.generation === "generated") t.generated++;
  if (r.generation === "failed") t.failed++;
  if (r.review === "approved") t.approved++;
  if (r.tokens !== null) {
    t.tokens += r.tokens;
    t.anyTokens = true;
  }
  if (r.cost === null) return;
  if (r.costEstimated) {
    t.estimated += r.cost;
    t.anyEstimated = true;
  } else {
    t.cost += r.cost;
    t.anyCost = true;
  }
}
