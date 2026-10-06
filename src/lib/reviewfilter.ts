// reviewfilter.ts — pure list filtering for Selection review (RULE 3, RULE 8).
// Owns: date modes (all / month / custom range), decision status filter,
// missing-pair filter and free-text search. A pair anchors on BOTH created and
// generated timestamps: it passes a range when either of them falls inside it.

import { attentionInfo, type ReviewPair } from "./pairing";
import { isRecord } from "./isrecord";

export type Decision = "pending" | "approved" | "declined";

/** A pair as shown in the review list: discovery data + stored decision. */
export interface ViewPair extends ReviewPair {
  decision: Decision;
  reviewedAt: string | null;
}

export type DateFilter =
  | { mode: "all" }
  | { mode: "month"; month: string } // "YYYY-MM"
  | { mode: "custom"; from: number; to: number }; // epoch ms, inclusive

/** Missing-pair states (spec V2 §8): incomplete = one side is absent. */
export type PairingFilter = "all" | "complete" | "incomplete";

export interface ListFilter {
  date: DateFilter;
  status: "all" | Decision;
  search: string;
  pairing: PairingFilter;
}

export const ALL_FILTER: ListFilter = { date: { mode: "all" }, status: "all", search: "", pairing: "all" };

export function applyFilters(pairs: ViewPair[], f: ListFilter): ViewPair[] {
  return pairs.filter((p) => inDate(p, f.date) && inStatus(p, f.status)
    && inSearch(p, f.search) && inPairing(p, f.pairing));
}

function inPairing(p: ViewPair, f: PairingFilter): boolean {
  if (f === "all") return true;
  return (attentionInfo(p) === null) === (f === "complete");
}

function inDate(p: ViewPair, d: DateFilter): boolean {
  if (d.mode === "all") return true;
  if (d.mode === "month") return anchors(p).some((t) => monthKey(t) === d.month);
  return anchors(p).some((t) => t >= d.from && t <= d.to);
}

/** Both existing side timestamps; the pair passes when either qualifies. */
function anchors(p: ViewPair): number[] {
  const out = [p.created];
  if (p.generated !== null) out.push(p.generated);
  return out;
}

function inStatus(p: ViewPair, s: ListFilter["status"]): boolean {
  return s === "all" || p.decision === s;
}

function inSearch(p: ViewPair, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${p.relDir}/${p.base}`.toLowerCase().includes(needle);
}

/** Epoch ms -> "YYYY-MM" in local time (month filter buckets). */
export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUSES: ListFilter["status"][] = ["all", "pending", "approved", "declined"];
const PAIRINGS: PairingFilter[] = ["all", "complete", "incomplete"];

/**
 * Stored filter → ListFilter. Partial payloads keep their valid parts and
 * default the rest; anything unusable yields ALL_FILTER (RULE 13).
 */
export function parseFilter(raw: unknown): ListFilter {
  if (!isRecord(raw)) return ALL_FILTER;
  return {
    date: parseDate(raw.date),
    status: pick(STATUSES, raw.status, "all"),
    search: typeof raw.search === "string" ? raw.search : "",
    pairing: pick(PAIRINGS, raw.pairing, "all"),
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

/** "Status: approved" — the words a history entry shows for a filter change. */
export function filterLabel(f: ListFilter): string {
  const bits: string[] = [];
  if (f.status !== "all") bits.push(`status ${f.status}`);
  if (f.pairing !== "all") bits.push(f.pairing === "complete" ? "complete pairs" : "incomplete pairs");
  if (f.search !== "") bits.push(`“${f.search}”`);
  if (f.date.mode === "month") bits.push(f.date.month);
  if (f.date.mode === "custom") bits.push("custom range");
  return `Filter: ${bits.length > 0 ? bits.join(", ") : "all pairs"}`;
}
