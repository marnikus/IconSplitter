// sourcelist.ts — which approved sources the Generate SVG tab may list
// (invariants I-31…I-35). A row exists iff a file on disk carries the canonical
// `_AI` name AND an approved decision covers that file — by the pair's own id,
// by an approved record whose `ai_result` is exactly that path, or by an
// approved record that named only the reference the AI image sits beside (ids
// drift when a file moves between split folders, and an AI image that arrives
// after the decision has a suffix the record never saw; the paths do not drift).
//
// Everything else is REPORTED, never listed: an approved pair whose AI image is
// gone, a record with no files left, a record that names a reference with no AI
// image beside it, and a record for a path another row already has. This is the
// fix for the reported symptoms — the same AI source listed twice, a reference
// image offered as something to generate from, and an existing AI icon reported
// as "a reference image" — so the rules live here, pure and testable, instead of
// inside the scan. `audit.ts` owns the counts of all of it and their wording.

import { isEligibleImage, isVersionArtifact } from "../lib/naming";
import { problemsOf, type ReviewPair, type SideRef } from "../lib/pairing";
import type { ReviewRecord } from "../lib/reviewfile";

/** A pair the list may show: its AI image really exists on disk. */
export type RowPair = ReviewPair & { ai: SideRef };

export type ExclusionKind = "ai-missing" | "no-files" | "not-ai-output" | "artifact" | "duplicate";

/** One approved source that is NOT listed, with the reason it is not. */
export interface SourceExclusion {
  id: string;
  relPath: string | null;
  kind: ExclusionKind;
  reason: string;
}

export interface ListSelection {
  rows: RowPair[];
  excluded: SourceExclusion[];
  missing: number;
  duplicates: number;
}

/** normalized reference path -> the pair id whose AI image sits beside it. */
type ReferenceOwners = Map<string, string>;

/**
 * Canonical AI naming, one place: `_AI`, `_AI_7`, `_AI_9_01`, a raster image
 * extension. A `.svg` carrying an AI name is this app's own generated output
 * (`fog_AI.png` -> `fog_AI.svg`), never an image to generate from — otherwise a
 * second run would feed an artifact back in.
 */
export function isCanonicalAi(name: string): boolean {
  return isEligibleImage(name) && isRaster(ext(name)) && !isVersionArtifact(name);
}

/** True for an AI-named SVG: this app's output, not a source. */
export function isAiArtifact(name: string): boolean {
  return isEligibleImage(name) && !isRaster(ext(name));
}

function isRaster(ext: string): boolean {
  return ext.toLowerCase() !== ".svg";
}

/** The rows, the exclusions and the dedupe counts for one scan. */
export function selectRows(pairs: readonly ReviewPair[], records: readonly ReviewRecord[]): ListSelection {
  const owner = referenceOwners(pairs);
  const approved = approvedPairs(pairs, records, owner);
  const sink = newSink(owner);
  for (const pair of pairs) addPair(pair, approved.has(pair.pairId), sink);
  for (const r of records) addRecord(r, sink);
  const sorted = [...sink.excluded].sort(byPlace);
  return {
    rows: sink.rows,
    excluded: sorted,
    missing: sorted.filter((e) => e.kind === "ai-missing" || e.kind === "no-files").length,
    duplicates: sorted.filter((e) => e.kind === "duplicate").length,
  };
}

/** One scan's accumulator: the rows, the reports, and what has spoken already. */
function newSink(owner: ReferenceOwners): Sink {
  return {
    rows: [], excluded: [], claimed: new Map(), approver: new Map(),
    represented: new Set(), existing: new Set(), owner,
  };
}

/**
 * Which pairs on disk an approved decision covers (I-35): the pair's own id,
 * the AI path a record names, or the reference a record named before the AI
 * image existed. One pass, so every pair is judged against the same records.
 */
function approvedPairs(pairs: readonly ReviewPair[], records: readonly ReviewRecord[], owner: ReferenceOwners): Set<string> {
  const out = new Set<string>();
  for (const p of pairs) if (isApproved(p, records, owner)) out.add(p.pairId);
  return out;
}

function isApproved(pair: ReviewPair, records: readonly ReviewRecord[], owner: ReferenceOwners): boolean {
  const own = records.find((r) => r.pair_id === pair.pairId);
  if (own) return own.decision === "approved"; // the pair's own record decides
  if (pair.ai === null) return false;
  const ai = key(pair.ai.relPath);
  if (approvedAiPath(records, ai)) return true;
  return coversReference(pair, records, owner, ai);
}

/** True when an approved record names this exact AI path. */
function approvedAiPath(records: readonly ReviewRecord[], aiPath: string): boolean {
  return records.some((r) => r.decision === "approved" && r.ai_result !== null && key(r.ai_result) === aiPath);
}

/**
 * True when an approved record named ONLY the reference — the AI image arrived
 * after the decision — and this pair is the one that owns that reference. A
 * record naming the pair's own AI path (approved or declined) outranks it.
 */
function coversReference(pair: ReviewPair, records: readonly ReviewRecord[], owner: ReferenceOwners, aiPath: string): boolean {
  if (pair.source === null) return false;
  const ref = key(pair.source.relPath);
  if (owner.get(ref) !== pair.pairId) return false; // another AI image owns that reference
  if (records.some((r) => r.ai_result !== null && key(r.ai_result) === aiPath)) return false;
  return records.some((r) => r.decision === "approved" && r.ai_result === null
    && r.source !== null && key(r.source) === ref);
}

/**
 * The pair that owns a reference path: the first in canonical order, so the
 * canonical `…_AI.ext` result wins over a later variation and the answer never
 * depends on how many AI images happen to share one reference.
 */
function referenceOwners(pairs: readonly ReviewPair[]): ReferenceOwners {
  const out: ReferenceOwners = new Map();
  for (const p of pairs) {
    if (p.source === null || p.ai === null) continue;
    const ref = key(p.source.relPath);
    if (!out.has(ref)) out.set(ref, p.pairId);
  }
  return out;
}

interface Sink {
  rows: RowPair[];
  excluded: SourceExclusion[];
  /** normalized path -> the id that owns it (a row or an explained pair). */
  claimed: Map<string, string>;
  /** claimed path -> the id of the record that approved it, when one did. */
  approver: Map<string, string>;
  /** Every pair id that has already spoken (a row or an exclusion). */
  represented: Set<string>;
  /** Normalized AI paths that really exist on disk, approved or not. */
  existing: Set<string>;
  /** Which pair owns each reference an AI image sits beside (I-35). */
  owner: ReferenceOwners;
}

/**
 * One pair on disk: a row when its AI image exists and is approved, an
 * `ai-missing` exclusion when an approved reference has no AI image beside it,
 * nothing at all when it is simply not approved.
 */
function addPair(pair: ReviewPair, approved: boolean, sink: Sink): void {
  if (pair.ai !== null) {
    sink.existing.add(key(pair.ai.relPath));
    if (!approved) return;
    if (isCanonicalAi(baseName(pair.ai.relPath))) addRow(pair as RowPair, sink);
    else {
      const relPath = pair.ai.relPath;
      sink.represented.add(pair.pairId);
      sink.excluded.push({ id: pair.pairId, relPath, kind: "artifact", reason: `${relPath} is this app's own SVG output, not an AI image` });
    }
    return;
  }
  if (!approved) return;
  const relPath = pair.source?.relPath ?? pair.base;
  sink.represented.add(pair.pairId);
  sink.claimed.set(key(relPath), pair.pairId);
  sink.excluded.push({ id: pair.pairId, relPath, kind: "ai-missing", reason: firstProblem(pair) });
}

/** A row per normalized AI path: the first wins, a second pair at the same path is a duplicate. */
function addRow(pair: RowPair, sink: Sink): void {
  const path = key(pair.ai.relPath);
  sink.represented.add(pair.pairId);
  if (!sink.claimed.has(path)) {
    sink.claimed.set(path, pair.pairId);
    sink.rows.push(pair);
    return;
  }
  sink.excluded.push({ id: pair.pairId, relPath: pair.ai.relPath, kind: "duplicate", reason: duplicateReason(pair.ai.relPath) });
}

/**
 * One decision record. A record whose pair already spoke is that pair's own
 * record; the first record naming a path a row already owns is that row's
 * approver, and only a second one is a duplicate; a record that names no AI
 * result is a reference, not a source;
 * anything else with nothing left on disk is a record only. A record naming an
 * AI image that exists but is not approved is simply not a listed source.
 */
function addRecord(r: ReviewRecord, sink: Sink): void {
  if (r.decision !== "approved" || sink.represented.has(r.pair_id)) return;
  const path = r.ai_result ?? r.source;
  if (path === null) return;
  const place = key(path);
  if (sink.claimed.has(place)) {
    sink.represented.add(r.pair_id);
    // The first record naming a claimed path is the record that approved it —
    // the row's id may simply be older than the folder it now lives in. Only a
    // SECOND record for the same path is the duplicate the user saw.
    if (!sink.approver.has(place)) sink.approver.set(place, r.pair_id);
    else sink.excluded.push(exclusion(r, path, "duplicate", duplicateReason(path)));
    return;
  }
  sink.represented.add(r.pair_id);
  if (r.ai_result === null) {
    sink.claimed.set(place, r.pair_id);
    // An AI image sits beside that reference now: this record is its approval,
    // not an anomaly. Only a reference with no AI image beside it is reported.
    if (!sink.owner.has(place)) {
      sink.excluded.push(exclusion(r, path, "not-ai-output", `${path} is a reference image, not an AI output`));
    }
    return;
  }
  if (sink.existing.has(key(r.ai_result))) return;
  sink.claimed.set(place, r.pair_id);
  sink.excluded.push(exclusion(r, path, "no-files", `only the decision record remains for ${path}`));
}

function exclusion(r: ReviewRecord, relPath: string, kind: ExclusionKind, reason: string): SourceExclusion {
  return { id: r.pair_id, relPath, kind, reason };
}

function duplicateReason(path: string): string {
  return `duplicate record for ${path} — the same source is already reported`;
}

/** The pair's own problem wording, so a row status and an exclusion agree. */
function firstProblem(pair: ReviewPair): string {
  return problemsOf(pair)[0]?.reason ?? `no AI result beside ${pair.base}`;
}

function key(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/** The extension of a file name, dot included; "" when there is none. */
export function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** Deterministic exclusion order: by path, then id — never by arrival order. */
function byPlace(a: SourceExclusion, b: SourceExclusion): number {
  const path = (a.relPath ?? "").localeCompare(b.relPath ?? "");
  return path !== 0 ? path : a.id.localeCompare(b.id);
}

