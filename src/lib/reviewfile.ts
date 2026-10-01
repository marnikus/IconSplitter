// reviewfile.ts — the review decision JSON model (spec §8; RULE 13).
// Owns: the DecisionRecord/ReviewFile shape, strict parsing that reports a
// corrupt payload instead of silently dropping it, upsert of a changed
// decision, and syncRecords which creates a pending record for every pair a
// scan discovered and keeps history for pairs that vanished.
// Pure module: reading/writing the file itself lives in src/lib/reviewio.ts.

export type Decision = "pending" | "approved" | "declined";

export const REVIEW_VERSION = 1;

export interface DecisionRecord {
  pair_id: string;
  source: string; // root-relative path, "" when that side does not exist
  ai_result: string;
  decision: Decision;
  reviewed_at: string; // ISO-8601 of the last decision change
}

export interface ReviewFile {
  version: number;
  updated: string;
  records: DecisionRecord[];
}

/** Minimal pair shape syncRecords needs (ReviewPair satisfies it structurally). */
export interface PairRef {
  id: string;
  source: string | null;
  ai: string | null;
}

export type ReviewParse = { ok: true; file: ReviewFile } | { ok: false; reason: string };

export function blankReviewFile(): ReviewFile {
  return { version: REVIEW_VERSION, updated: "", records: [] };
}

/** Missing/blank text is an empty pending set; anything else must validate. */
export function parseReviewFile(text: string): ReviewParse {
  if (text.trim() === "") return { ok: true, file: blankReviewFile() };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `Not valid JSON — ${messageOf(e)}` };
  }
  return validateReviewFile(raw);
}

function validateReviewFile(raw: unknown): ReviewParse {
  if (!isObject(raw)) return { ok: false, reason: "Not a review file object" };
  const o = raw as Record<string, unknown>;
  if (o.version !== REVIEW_VERSION) return { ok: false, reason: `Unknown review file version: ${String(o.version)}` };
  if (!Array.isArray(o.records)) return { ok: false, reason: "Missing records array" };
  const parsed = o.records.map(validRecord);
  const unreadable = parsed.filter((r) => r === null).length;
  if (unreadable > 0) return { ok: false, reason: `${unreadable} of ${parsed.length} records are unreadable` };
  return {
    ok: true,
    file: { version: REVIEW_VERSION, updated: strOr(o.updated, ""), records: parsed as DecisionRecord[] },
  };
}

function validRecord(raw: unknown): DecisionRecord | null {
  if (!isObject(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pair_id !== "string" || r.pair_id.trim() === "") return null;
  if (!isDecision(r.decision)) return null;
  return {
    pair_id: r.pair_id,
    source: strOr(r.source, ""),
    ai_result: strOr(r.ai_result, ""),
    decision: r.decision,
    reviewed_at: strOr(r.reviewed_at, ""),
  };
}

export function serializeReviewFile(file: ReviewFile): string {
  const records = file.records.map(plainRecord);
  return JSON.stringify({ version: REVIEW_VERSION, updated: file.updated, records }, null, 2);
}

/** Adds a record, or replaces the record of the same pair id in place. */
export function upsertRecord(file: ReviewFile, record: DecisionRecord): ReviewFile {
  const idx = file.records.findIndex((r) => sameId(r.pair_id, record.pair_id));
  const records = idx < 0 ? [...file.records, record] : file.records.map((r, i) => (i === idx ? record : r));
  return { ...file, updated: record.reviewed_at || file.updated, records };
}

export function recordIndex(records: DecisionRecord[]): Map<string, DecisionRecord> {
  return new Map(records.map((r) => [r.pair_id.toLowerCase(), r]));
}

export interface SyncRecordsResult {
  file: ReviewFile;
  added: number;
}

/**
 * Reconciles the stored file with a fresh scan: unknown pairs get a pending
 * record (a missing file therefore means "all pairs pending"), known pairs keep
 * their decision and only refresh their paths. Records of vanished pairs stay.
 */
export function syncRecords(file: ReviewFile, pairs: PairRef[], now: string): SyncRecordsResult {
  const index = recordIndex(file.records);
  const additions: DecisionRecord[] = [];
  const refreshed = new Map<string, DecisionRecord>();
  for (const ref of pairs) collectSync(ref, index, additions, refreshed);
  if (additions.length === 0 && refreshed.size === 0) return { file, added: 0 };
  const records = file.records.map((r) => refreshed.get(r.pair_id.toLowerCase()) ?? r);
  return { file: { version: REVIEW_VERSION, updated: now, records: [...records, ...additions] }, added: additions.length };
}

function collectSync(
  ref: PairRef, index: Map<string, DecisionRecord>, additions: DecisionRecord[],
  refreshed: Map<string, DecisionRecord>,
): void {
  const key = ref.id.toLowerCase();
  const prev = index.get(key);
  if (!prev) return void additions.push(pendingRecord(ref));
  const source = ref.source ?? "";
  const ai = ref.ai ?? "";
  if (prev.source !== source || prev.ai_result !== ai) {
    refreshed.set(key, { ...prev, source, ai_result: ai, reviewed_at: prev.reviewed_at });
  }
}

/** Nothing has been reviewed yet, so there is no reviewed_at timestamp. */
function pendingRecord(ref: PairRef): DecisionRecord {
  return {
    pair_id: ref.id, source: ref.source ?? "", ai_result: ref.ai ?? "",
    decision: "pending", reviewed_at: "",
  };
}

function plainRecord(r: DecisionRecord): DecisionRecord {
  return {
    pair_id: r.pair_id, source: r.source, ai_result: r.ai_result,
    decision: r.decision, reviewed_at: r.reviewed_at,
  };
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isObject(x: unknown): boolean {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isDecision(x: unknown): x is Decision {
  return x === "pending" || x === "approved" || x === "declined";
}

function strOr(x: unknown, fallback: string): string {
  return typeof x === "string" ? x : fallback;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
