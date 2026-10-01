// reviewfile.ts — pure decision-record model for Selection review (RULE 13).
// Owns: record shape + validation, tolerant parsing (corrupt never destroys
// in-memory decisions), merge onto scanned pairs, rename carry-over via
// identity keys, and rescan diff counts. No IO here (reviewstore does that).

import { identityKey, type ReviewPair } from "./pairing";
import type { Decision, ViewPair } from "./reviewfilter";

/** One stored review decision (spec §8 example record). */
export interface ReviewRecord {
  pair_id: string;
  source: string | null;
  ai_result: string | null;
  decision: Decision;
  reviewed_at: string; // ISO-8601
}

export type ParseOut = { ok: true; records: ReviewRecord[] } | { ok: false };

export function parseDecisions(text: string): ParseOut {
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecordList(data)) return { ok: false };
    return { ok: true, records: data.records.filter(validRecord) };
  } catch {
    return { ok: false };
  }
}

function isRecordList(d: unknown): d is { records: unknown[] } {
  return typeof d === "object" && d !== null && Array.isArray((d as { records?: unknown }).records);
}

function validRecord(r: unknown): r is ReviewRecord {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  return typeof x.pair_id === "string" && typeof x.reviewed_at === "string"
    && strOrNull(x.source) && strOrNull(x.ai_result) && validDecision(x.decision);
}

function strOrNull(v: unknown): boolean {
  return v === null || typeof v === "string";
}

function validDecision(v: unknown): boolean {
  return v === "pending" || v === "approved" || v === "declined";
}

export function serializeDecisions(records: ReviewRecord[]): string {
  const sorted = [...records].sort((a, b) => (a.pair_id < b.pair_id ? -1 : 1));
  return JSON.stringify({ records: sorted }, null, 2);
}

export interface MergeOut {
  byId: Map<string, ViewPair>;
  orphans: ReviewRecord[]; // records whose pair is absent this scan
}

/** Direct pair_id match; pairs without a record start pending (spec §8). */
export function mergeDecisions(pairs: ReviewPair[], records: ReviewRecord[]): MergeOut {
  const recById = new Map(records.map((r) => [r.pair_id, r]));
  const byId = new Map<string, ViewPair>();
  for (const p of pairs) byId.set(p.pairId, toView(p, recById.get(p.pairId) ?? null));
  const orphans = records.filter((r) => !byId.has(r.pair_id));
  return { byId, orphans };
}

function toView(p: ReviewPair, r: ReviewRecord | null): ViewPair {
  return {
    ...p,
    decision: r ? r.decision : "pending",
    reviewedAt: r ? r.reviewed_at : null,
  };
}

export interface CarryOut {
  byId: Map<string, ViewPair>;
  renamed: number; // pairs whose decision travelled via identity key
  carriedFrom: string[]; // prev pair_ids whose record was consumed by a carry
}

/** Direct match + decision inheritance for renamed/moved pairs (spec §9). */
export function carryRenamed(
  prevPairs: ReviewPair[], newPairs: ReviewPair[], records: Map<string, ReviewRecord>,
): CarryOut {
  const { byId } = mergeDecisions(newPairs, [...records.values()]);
  const moved = identityMapOfGone(prevPairs, newPairs);
  let renamed = 0;
  const carriedFrom: string[] = [];
  for (const p of newPairs) {
    const view = byId.get(p.pairId);
    if (!view || view.reviewedAt !== null) continue;
    const from = inherit(view, p, moved, records);
    if (from) {
      renamed++;
      carriedFrom.push(from);
    }
  }
  return { byId, renamed, carriedFrom };
}

/** Applies an inherited decision; returns the consumed prev pair_id or null. */
function inherit(view: ViewPair, p: ReviewPair, moved: Map<string, string>, records: Map<string, ReviewRecord>): string | null {
  const prevId = moved.get(identityKey(p));
  const rec = prevId ? records.get(prevId) : undefined;
  if (!rec || !prevId) return null;
  view.decision = rec.decision;
  view.reviewedAt = rec.reviewed_at;
  return prevId;
}

/** identityKey -> pairId of prev pairs absent from the new scan. */
function identityMapOfGone(prevPairs: ReviewPair[], newPairs: ReviewPair[]): Map<string, string> {
  const currIds = new Set(newPairs.map((p) => p.pairId));
  const out = new Map<string, string>();
  for (const p of prevPairs) if (!currIds.has(p.pairId)) out.set(identityKey(p), p.pairId);
  return out;
}

export interface PairDiff {
  added: number;
  removed: number;
  renamed: number;
  unchanged: number;
}

/** Rescan summary vs the previous view (rename = same identity, new id). */
export function diffPairs(prev: ViewPair[], curr: ReviewPair[]): PairDiff {
  const prevById = new Map(prev.map((p) => [p.pairId, p]));
  const gone = prev.filter((p) => !curr.some((c) => c.pairId === p.pairId));
  const goneByIdentity = new Map(gone.map((p) => [identityKey(p), p]));
  let renamed = 0;
  let added = 0;
  for (const c of curr) {
    if (prevById.has(c.pairId)) continue;
    if (goneByIdentity.has(identityKey(c))) renamed++;
    else added++;
  }
  const renamedGone = new Set(
    gone.filter((g) => curr.some((c) => identityKey(c) === identityKey(g))).map((g) => g.pairId),
  );
  return { added, removed: gone.length - renamedGone.size, renamed, unchanged: prev.length - gone.length };
}

/**
 * Offline undo/redo: replace the stored records for the touched pairs with the
 * ones a history entry carries, leaving every other record untouched. A pair
 * back to pending owns no record (I-13), so it is simply absent from `patch`.
 */
export function patchRecords(records: ReviewRecord[], touched: readonly string[], patch: ReviewRecord[]): ReviewRecord[] {
  const drop = new Set(touched);
  return [...records.filter((r) => !drop.has(r.pair_id)), ...patch.filter((r) => drop.has(r.pair_id))];
}
