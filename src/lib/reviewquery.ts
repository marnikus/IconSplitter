// reviewquery.ts — filters and sorting of the review list (spec §3, §4).
// Owns: the all/month/custom-range scope, the status filter, the four sort keys
// with both directions, and the local-time parsing behind the From/To inputs.
// Pure module: the list itself lives in src/lib/reviewmerge.ts.

import { pad2 } from "./naming";
import { displayName } from "./reviewformat";
import type { Decision } from "./reviewfile";
import type { ReviewItem } from "./reviewmerge";
import { compareText } from "./text";

export type StatusFilter = "all" | Decision;
export type ScopeMode = "all" | "month" | "range";
export type SortKey = "date" | "status" | "name" | "path";
export type SortDir = "asc" | "desc";

export interface ReviewQuery {
  search: string;
  scope: { mode: ScopeMode; month: string; from: string; to: string };
  status: StatusFilter;
  sort: { key: SortKey; dir: SortDir };
}

export interface QueryPatch {
  search?: string;
  scope?: Partial<ReviewQuery["scope"]>;
  status?: StatusFilter;
  sort?: Partial<ReviewQuery["sort"]>;
}

export function defaultQuery(): ReviewQuery {
  return {
    search: "",
    scope: { mode: "all", month: "", from: "", to: "" },
    status: "all",
    sort: { key: "date", dir: "desc" },
  };
}

export function mergeQuery(query: ReviewQuery, patch: QueryPatch): ReviewQuery {
  return {
    search: patch.search ?? query.search,
    scope: { ...query.scope, ...patch.scope },
    status: patch.status ?? query.status,
    sort: { ...query.sort, ...patch.sort },
  };
}

export function filtersCleared(query: ReviewQuery): boolean {
  return query.scope.mode === "all" && query.status === "all";
}

/** Returns a new, sorted array — the caller's list is never mutated. */
export function applyQuery(items: ReviewItem[], query: ReviewQuery): ReviewItem[] {
  return items.filter((item) => matches(item, query)).sort(comparator(query.sort));
}

function matches(item: ReviewItem, query: ReviewQuery): boolean {
  if (query.status !== "all" && item.status !== query.status) return false;
  return matchesSearch(item, query.search) && inScope(item.createdAt, query.scope);
}

/** Free-text search over the file name and its folder (case-insensitive). */
function matchesSearch(item: ReviewItem, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  return itemPath(item).toLowerCase().includes(needle);
}

/** The oldest and newest creation date in the list, for prefilling From/To. */
export function dataRange(items: ReviewItem[]): { from: number; to: number } | null {
  if (items.length === 0) return null;
  const times = items.map((i) => i.createdAt);
  return { from: Math.min(...times), to: Math.max(...times) };
}

export interface DirLabels {
  asc: string;
  desc: string;
}

/** Order-select labels per sort key (design: "Newest first", "A → Z", …). */
export function sortDirLabels(key: SortKey): DirLabels {
  if (key === "date") return { asc: "Oldest first", desc: "Newest first" };
  if (key === "status") return { asc: "Pending first", desc: "Declined first" };
  return { asc: "A → Z", desc: "Z → A" };
}

/** An empty month / empty range means "no restriction", never an empty list. */
function inScope(ts: number, scope: ReviewQuery["scope"]): boolean {
  if (scope.mode === "month") return scope.month === "" || monthStamp(ts) === scope.month;
  if (scope.mode === "range") return inRange(ts, parseStamp(scope.from), parseStamp(scope.to));
  return true;
}

function inRange(ts: number, from: number | null, to: number | null): boolean {
  return (from === null || ts >= from) && (to === null || ts <= to);
}

const STATUS_RANK: Record<Decision, number> = { pending: 0, approved: 1, declined: 2 };

function comparator(sort: ReviewQuery["sort"]): (a: ReviewItem, b: ReviewItem) => number {
  const sign = sort.dir === "desc" ? -1 : 1;
  return (a, b) => sign * compareBy(a, b, sort.key) || compareText(a.id, b.id);
}

function compareBy(a: ReviewItem, b: ReviewItem, key: SortKey): number {
  if (key === "date") return a.createdAt - b.createdAt;
  if (key === "status") return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (key === "name") return compareText(displayName(a), displayName(b));
  return compareText(itemPath(a), itemPath(b));
}

function itemPath(item: ReviewItem): string {
  return `${item.dirPath}/${displayName(item)}`;
}

/** Parses `2026-10-01T05:30`, `2026-10-01 05:30` or `2026-10-01` as local time. */
export function parseStamp(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function monthStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
