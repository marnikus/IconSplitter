// batchfilter.ts — pure list filtering for Batch folders + review (RULE 3/8)
// Owns: date modes (all/month/custom), status filter, review filter, search. Anchors on mtime.
// Shared shape with reviewfilter so V2 controls can be reused as reference.

import { monthKey as reviewMonthKey } from "./reviewfilter";
import type { SourceStatus, BatchReviewStatus } from "./statefile";
import { isRecord } from "./isrecord";
import { matchesSearch } from "./textsearch";
import { anyOf, isAllPicked, multiText, parseMulti, type Multi } from "./multifilter";

export type DateFilter =
  | { mode: "all" }
  | { mode: "month"; month: string } // YYYY-MM
  | { mode: "custom"; from: number; to: number }; // epoch ms inclusive

export type BatchStatusFilter = "all" | SourceStatus;
export type BatchReviewFilter = "all" | BatchReviewStatus;

export interface BatchFilter {
  date: DateFilter;
  /** One state, several, or all — lib/multifilter. */
  status: Multi<BatchStatusFilter>;
  review?: Multi<BatchReviewFilter>;
  search: string;
}

export const ALL_BATCH_FILTER: BatchFilter = {
  date: { mode: "all" },
  status: "all",
  review: "all",
  search: "",
};

export interface BatchRowLike {
  mtime: number;
  status: SourceStatus;
  review?: BatchReviewStatus;
  name: string;
  relPath: string;
  dirPath: string;
}

export function applyBatchFilters<T extends BatchRowLike>(rows: T[], f: BatchFilter): T[] {
  return rows.filter((r) => inDate(r, f.date) && inStatus(r, f.status) && inReview(r, (f as any).review) && inSearch(r, f.search));
}

function inDate(r: BatchRowLike, d: DateFilter): boolean {
  if (d.mode === "all") return true;
  if (d.mode === "month") return monthKey(r.mtime) === d.month;
  return r.mtime >= d.from && r.mtime <= d.to;
}

function inStatus(r: BatchRowLike, s: Multi<BatchStatusFilter>): boolean {
  return anyOf(s, "all", (w) => r.status === w);
}

function inReview(r: BatchRowLike, review: Multi<BatchReviewFilter> | undefined): boolean {
  return anyOf(review, "all", (w) => (r.review ?? "pending") === w);
}

/** File name, folder, processing status and review (lib/textsearch). */
function inSearch(r: BatchRowLike, query: string): boolean {
  return matchesSearch(query, [r.name, r.dirPath, r.relPath, r.status, r.review]);
}

export function monthKey(t: number): string {
  return reviewMonthKey(t);
}

const STATUSES: BatchStatusFilter[] = ["all", "unprocessed", "processed", "skipped", "missing", "changed", "deleted"];
const REVIEWS: BatchReviewFilter[] = ["all", "pending", "approved", "declined", "warning"];

export function parseBatchFilter(raw: unknown): BatchFilter {
  if (!isRecord(raw)) return ALL_BATCH_FILTER;
  return {
    date: parseDate(raw.date),
    status: parseMulti(raw.status, STATUSES, "all"),
    review: parseMulti(raw.review, REVIEWS, "all"),
    search: typeof raw.search === "string" ? raw.search : "",
  };
}

function parseDate(raw: unknown): DateFilter {
  if (!isRecord(raw)) return { mode: "all" };
  if (raw.mode === "month" && typeof raw.month === "string") return { mode: "month", month: raw.month };
  if (raw.mode === "custom" && isRange(raw.from) && isRange(raw.to)) return { mode: "custom", from: raw.from, to: raw.to };
  return { mode: "all" };
}

function isRange(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function batchFilterLabel(f: BatchFilter): string {
  const bits: string[] = [];
  if (!isAllPicked(f.status, "all")) bits.push(`status ${multiText(f.status, "all")}`);
  if (!isAllPicked(f.review, "all")) bits.push(`review ${multiText(f.review, "all")}`);
  if (f.search !== "") bits.push(`“${f.search}”`);
  if (f.date.mode === "month") bits.push(f.date.month);
  if (f.date.mode === "custom") bits.push("custom range");
  return `Filter: ${bits.length > 0 ? bits.join(", ") : "all images"}`;
}
