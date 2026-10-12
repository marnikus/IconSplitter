// batchfilter.ts — pure list filtering for Batch folders (RULE 3/8)
// Owns: date modes (all/month/custom), status filter, search. Anchors on mtime.
// Shared shape with reviewfilter so V2 controls can be reused as reference.

import { monthKey as reviewMonthKey } from "./reviewfilter";
import type { SourceStatus } from "./statefile";
import { isRecord } from "./isrecord";

export type DateFilter =
  | { mode: "all" }
  | { mode: "month"; month: string } // YYYY-MM
  | { mode: "custom"; from: number; to: number }; // epoch ms inclusive

export type BatchStatusFilter = "all" | SourceStatus;

export interface BatchFilter {
  date: DateFilter;
  status: BatchStatusFilter;
  search: string;
}

export const ALL_BATCH_FILTER: BatchFilter = {
  date: { mode: "all" },
  status: "all",
  search: "",
};

export interface BatchRowLike {
  mtime: number;
  status: SourceStatus;
  name: string;
  relPath: string;
  dirPath: string;
}

export function applyBatchFilters<T extends BatchRowLike>(rows: T[], f: BatchFilter): T[] {
  return rows.filter((r) => inDate(r, f.date) && inStatus(r, f.status) && inSearch(r, f.search));
}

function inDate(r: BatchRowLike, d: DateFilter): boolean {
  if (d.mode === "all") return true;
  if (d.mode === "month") return monthKey(r.mtime) === d.month;
  return r.mtime >= d.from && r.mtime <= d.to;
}

function inStatus(r: BatchRowLike, s: BatchStatusFilter): boolean {
  return s === "all" || r.status === s;
}

function inSearch(r: BatchRowLike, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${r.dirPath}/${r.name}`.toLowerCase().includes(needle) || r.relPath.toLowerCase().includes(needle);
}

export function monthKey(t: number): string {
  return reviewMonthKey(t);
}

const STATUSES: BatchStatusFilter[] = ["all", "unprocessed", "processed", "skipped", "missing", "changed", "deleted"];

export function parseBatchFilter(raw: unknown): BatchFilter {
  if (!isRecord(raw)) return ALL_BATCH_FILTER;
  return {
    date: parseDate(raw.date),
    status: pick(STATUSES, raw.status, "all"),
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

function pick<T extends string>(allowed: T[], raw: unknown, fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function batchFilterLabel(f: BatchFilter): string {
  const bits: string[] = [];
  if (f.status !== "all") bits.push(`status ${f.status}`);
  if (f.search !== "") bits.push(`“${f.search}”`);
  if (f.date.mode === "month") bits.push(f.date.month);
  if (f.date.mode === "custom") bits.push("custom range");
  return `Filter: ${bits.length > 0 ? bits.join(", ") : "all images"}`;
}
