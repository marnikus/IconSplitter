// rows.ts — derive the Generate SVG list from approved Selection pairs and
// their sidecars (pure): one row per approved AI source, filters, sort and
// search. No IO here (RULE 1, RULE 3).

import type { ViewPair } from "../lib/reviewfilter";
import { latestValid, reviewOf, type Sidecar } from "../lib/svgsidecar";

export type GenState = "not-generated" | "generating" | "generated" | "failed" | "interrupted";
export type ReviewState = "pending" | "approved" | "declined";

export interface SvgRow {
  pairId: string;
  name: string;
  relDir: string;
  fingerprint: string;
  generation: GenState;
  review: ReviewState | null;
  version: number | null;
  tokensTotal: number | null;
  cost: number | null;
  costKind: "actual" | "estimated" | null;
  warnings: string[];
  sidecarError: boolean;
}

/** Only approved pairs that actually have an AI image are eligible. */
export function approvedSources(pairs: ViewPair[]): ViewPair[] {
  return pairs.filter((p) => p.decision === "approved" && p.ai !== null);
}

export function fingerprintOf(p: ViewPair): string {
  const a = p.ai;
  return `${p.pairId}:${a ? `${a.size}:${a.mtime}` : "none"}`;
}

export function rowFrom(p: ViewPair, sidecar: Sidecar | null, live: GenState | null, sidecarError: boolean): SvgRow {
  const valid = sidecar ? latestValid(sidecar) : null;
  return {
    pairId: p.pairId, name: aiName(p), relDir: p.relDir, fingerprint: fingerprintOf(p),
    generation: live ?? generationOf(sidecar), review: reviewOf(sidecar ?? EMPTY),
    version: valid?.version ?? null, tokensTotal: valid?.tokensTotal ?? null,
    cost: valid?.cost ?? null, costKind: valid?.costKind ?? null,
    warnings: valid?.validationWarnings ?? [], sidecarError,
  };
}

const EMPTY: Sidecar = { v: 1, sourceId: "", sourcePath: "", fingerprint: "", versions: [] };

export function aiName(p: ViewPair): string {
  return p.ai?.relPath.split("/").pop() ?? p.base;
}

function generationOf(sidecar: Sidecar | null): GenState {
  if (!sidecar || sidecar.versions.length === 0) return "not-generated";
  const last = sidecar.versions[sidecar.versions.length - 1];
  if (last.status === "interrupted") return "interrupted";
  return latestValid(sidecar) ? "generated" : "failed";
}

export interface RowFilters {
  generation: "all" | GenState;
  review: "all" | ReviewState;
  search: string;
}

export const DEFAULT_ROW_FILTERS: RowFilters = { generation: "all", review: "all", search: "" };

export function filterRows(rows: SvgRow[], f: RowFilters): SvgRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) =>
    (f.generation === "all" || r.generation === f.generation)
    && (f.review === "all" || r.review === f.review)
    && (q === "" || r.name.toLowerCase().includes(q) || r.relDir.toLowerCase().includes(q)));
}

export type RowSort = "newest" | "name" | "generation" | "review" | "cost";

export function sortRows(rows: SvgRow[], by: RowSort): SvgRow[] {
  const out = [...rows];
  if (by === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  else if (by === "cost") out.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1));
  else if (by === "generation") out.sort((a, b) => a.generation.localeCompare(b.generation));
  else if (by === "review") out.sort((a, b) => String(a.review).localeCompare(String(b.review)));
  else out.sort((a, b) => b.pairId.localeCompare(a.pairId));
  return out;
}
