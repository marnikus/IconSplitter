// pairmerge.ts — the records a scan applies (I-13/I-42). A pair's own file
// speaks for it whenever it carries a decision (an explicit `pending` is a
// decision: a reset must outlive the legacy record); a file with no decision yet
// lets the legacy record through, so an approval is never lost to the migration;
// anything else the legacy file names is carried as well. Pure: metas and
// records in, the records to apply out (RULE 3).

import type { ReviewPair, SideRef } from "./pairing";
import type { PairMeta, PairSide } from "./pairmeta";
import type { ReviewRecord } from "./reviewfile";

/**
 * The records to apply. A pair's own file speaks for it whenever it carries a
 * decision (an explicit `pending` is a decision: a reset must outlive the legacy
 * record); a file with no decision yet — a freshly generated pair — lets the
 * legacy record through, so an approval is never lost to the migration.
 */
export function mergeRecords(metas: Map<string, PairMeta>, legacy: readonly ReviewRecord[]): ReviewRecord[] {
  const byLegacy = new Map(legacy.map((r) => [r.pair_id, r]));
  const out: ReviewRecord[] = [];
  for (const meta of sortedMetas(metas)) {
    const own = toRecord(meta, pairRefOf(meta));
    if (own !== null) out.push(own);
    else if (meta.decision === null) {
      const fallback = byLegacy.get(meta.id);
      if (fallback) out.push(fallback);
    }
  }
  const covered = new Set([...metas.keys()]);
  for (const r of legacy) if (!covered.has(r.pair_id)) out.push(r);
  return out.sort((a, b) => (a.pair_id < b.pair_id ? -1 : 1));
}

function sortedMetas(metas: Map<string, PairMeta>): PairMeta[] {
  return [...metas.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The pair a pair file describes, for building its record (paths only). */
export function pairRefOf(meta: PairMeta): ReviewPair {
  return {
    pairId: meta.id, base: meta.base, suffix: meta.suffix, relDir: meta.dirPath,
    source: sideRef(meta.source), ai: sideRef(realFace(meta.ai)),
    created: 0, generated: null,
  };
}

/** A face with no fingerprint was never seen on disk — it is a name, not a file. */
function realFace(side: PairSide): PairSide | null {
  return side.relPath === "" || side.fingerprint === "" ? null : side;
}

function sideRef(side: PairSide | null): SideRef | null {
  if (side === null) return null;
  const [size, mtime] = side.fingerprint.split(":");
  return { relPath: side.relPath, size: Number(size) || 0, mtime: Number(mtime) || 0, error: null };
}

/** The stored decision as a record entry (I-13: pending owns no record). */
export function toRecord(meta: PairMeta, pair: ReviewPair): ReviewRecord | null {
  if (meta.decision === null || meta.decision === "pending") return null;
  if (pair.source === null && pair.ai === null) return null; // a record must name a file
  return {
    pair_id: meta.id,
    source: pair.source?.relPath ?? null,
    ai_result: pair.ai?.relPath ?? null,
    decision: meta.decision,
    reviewed_at: meta.reviewedAt ?? new Date(0).toISOString(),
  };
}
