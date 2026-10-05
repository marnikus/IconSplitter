// sourcelist.ts — which approved sources the Generate SVG tab may list
// (invariants I-31…I-33). A row exists iff a file on disk carries the canonical
// `_AI` name AND an approved decision names that file — by the pair's own id, or
// by an approved record whose `ai_result` is exactly that path (ids drift when a
// file moves between split folders; the recorded approval does not).
//
// Everything else is REPORTED, never listed: an approved pair whose AI image is
// gone, a record with no files left, a record that names a reference image, and
// a record for a path another row already has. This is the fix for the two
// reported symptoms — the same AI source listed twice, and a reference image
// offered as something to generate from — so the rules live here, pure and
// testable, instead of inside the scan.
//
// The audit is the whole picture the list was checked against: files walked,
// canonical AI sources on disk, references excluded, missing sources, duplicates
// removed, final rows.

import { isEligibleImage, isImageExt, isVersionArtifact } from "../lib/naming";
import { problemsOf, type ReviewPair, type SideRef } from "../lib/pairing";
import type { ReviewRecord } from "../lib/reviewfile";
import type { FileEntry } from "../lib/scan";

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

/** What the scan found, in the numbers the audit line reports. */
export interface ScanAudit {
  files: number; // every file the walk saw
  aiSources: number; // canonical AI images on disk (eligible naming)
  references: number; // image files that are not AI outputs — never rows
  missing: number; // approved sources whose AI image is not on disk
  duplicates: number; // rows dropped because the same path was already taken
  rows: number; // the final unique list
}

export interface ListSelection {
  rows: RowPair[];
  excluded: SourceExclusion[];
  missing: number;
  duplicates: number;
}

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
function isAiArtifact(name: string): boolean {
  return isEligibleImage(name) && !isRaster(ext(name));
}

function isRaster(ext: string): boolean {
  return ext.toLowerCase() !== ".svg";
}

/**
 * Counts the whole tree the list was built from. Five buckets, so no file is
 * counted twice: this app's versioned outputs and its `_AI.svg` files are
 * ignored, canonical raster AI images are sources, and every other image is a
 * reference (never a source, whatever its name).
 */
export function fileTally(entries: readonly FileEntry[]): Pick<ScanAudit, "files" | "aiSources" | "references"> {
  let aiSources = 0;
  let references = 0;
  for (const e of entries) {
    if (isVersionArtifact(e.name) || isAiArtifact(e.name)) continue;
    if (isCanonicalAi(e.name)) aiSources += 1;
    else if (isImageExt(ext(e.name))) references += 1;
  }
  return { files: entries.length, aiSources, references };
}

/** The rows, the exclusions and the dedupe counts for one scan. */
export function selectRows(pairs: readonly ReviewPair[], records: readonly ReviewRecord[]): ListSelection {
  const sink: Sink = { rows: [], excluded: [], claimed: new Map(), approver: new Map(), represented: new Set(), existing: new Set() };
  for (const pair of pairs) addPair(pair, decide(pair, records), sink);
  for (const r of records) addRecord(r, sink);
  const sorted = [...sink.excluded].sort(byPlace);
  return {
    rows: sink.rows,
    excluded: sorted,
    missing: sorted.filter((e) => e.kind === "ai-missing" || e.kind === "no-files").length,
    duplicates: sorted.filter((e) => e.kind === "duplicate").length,
  };
}

/** The exact pair id wins; otherwise any approved record naming the AI path. */
function decide(pair: ReviewPair, records: readonly ReviewRecord[]): boolean {
  const own = records.find((r) => r.pair_id === pair.pairId);
  if (own) return own.decision === "approved";
  if (pair.ai === null) return false;
  const path = key(pair.ai.relPath);
  return records.some((r) => r.decision === "approved" && r.ai_result !== null && key(r.ai_result) === path);
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
    sink.excluded.push(exclusion(r, path, "not-ai-output", `${path} is a reference image, not an AI output`));
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

function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** Deterministic exclusion order: by path, then id — never by arrival order. */
function byPlace(a: SourceExclusion, b: SourceExclusion): number {
  const path = (a.relPath ?? "").localeCompare(b.relPath ?? "");
  return path !== 0 ? path : a.id.localeCompare(b.id);
}

/** The audit line: the whole picture, one line, so a count is never a mystery. */
export function auditText(a: ScanAudit): string {
  const parts = [
    plural(a.files, "file"), plural(a.aiSources, "AI source"),
    `${plural(a.references, "reference")} excluded`, plural(a.missing, "missing file"),
    `${plural(a.duplicates, "duplicate")} removed`,
  ];
  return `Audit — ${parts.join(" · ")} → ${plural(a.rows, "row")}`;
}

/** Why sources are missing from the list, grouped by kind (banner summary). */
export function exclusionSummary(excluded: readonly SourceExclusion[]): string {
  const parts = KINDS.flatMap(([kind, label]) => {
    const n = excluded.filter((e) => e.kind === kind).length;
    return n === 0 ? [] : [`${n} ${label}`];
  });
  return parts.join(", ");
}

const KINDS: [ExclusionKind, string][] = [
  ["ai-missing", "with no AI image on disk"],
  ["no-files", "with no files left"],
  ["not-ai-output", "with no AI result (reference images)"],
  ["artifact", "with only this app's own SVG output"],
  ["duplicate", "duplicate records"],
];

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
