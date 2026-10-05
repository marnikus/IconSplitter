// sources.ts — approved-source discovery for the Generate SVG tab (prompt §1).
// Owns: the recursive scan of the picked root, keeping ONLY pairs the Selection
// workflow approved, and reporting what needs attention *on the pair* instead of
// removing it: a missing AI image, a missing reference, an unreadable file, or a
// pair only its decision record still remembers (design D4/D8). The scan writes
// nothing (D5) and its answer is a function of the file set (D1/D2).

import type { BatchSource } from "../lib/svgbatch";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { compareNames, walkTree, type FileEntry } from "../lib/scan";
import {
  pairEntries, pairId, problemsOf, unreadableReason,
  type PairProblem, type ProblemKind, type ReviewPair,
} from "../lib/pairing";
import { mergeDecisions, type ReviewRecord } from "../lib/reviewfile";
import { loadDecisions } from "../selection/reviewstore";

/** One approved AI image the SVG tab may generate from. */
export interface SvgSource {
  /** Stable pair id from lib/pairing — survives sort, filter and restart. */
  id: string;
  /** AI image file name, e.g. "fog_architecture_041_AI.png". */
  name: string;
  /** Name stem the SVG files are built from. */
  stem: string;
  relPath: string;
  dirPath: string;
  /** size:mtime fingerprint captured at scan time ("missing" = no files left). */
  fingerprint: string;
  /** Per-file reasons this pair is not fully usable; empty when healthy. */
  problems: PairProblem[];
}

/** One reason, tied to the pair it belongs to. */
export interface SourceProblem extends PairProblem {
  id: string;
}

/** A file the scan could not read this time, with the reason. */
export interface FileProblem {
  relPath: string;
  reason: string;
}

export interface Discovery {
  /** Every approved pair — a problem is a status on the row, never a removal. */
  sources: SvgSource[];
  /** Every approved pair that needs attention, in source order. */
  problems: SourceProblem[];
  /** Files that could not be read (locked or being written) — not "changed". */
  unreadable: FileProblem[];
  /** review-decisions.json could not be parsed — decisions kept in memory. */
  corruptDecisions: boolean;
}

/** Short status per problem kind, for the row (D8). */
export const PROBLEM_LABEL: Record<ProblemKind, string> = {
  "ai-missing": "AI image missing",
  "original-missing": "Reference missing",
  unreadable: "Unreadable file",
  "files-missing": "Files missing",
};

/** Scans the root and lists every approved pair, in a deterministic order. */
export async function discoverApprovedSources(root: DirHandleLike): Promise<Discovery> {
  const entries = walkTree(await readDirTree(root, []), []);
  const pairs = pairEntries(entries);
  const load = await loadDecisions(root);
  const { byId, orphans } = mergeDecisions(pairs, load.records);
  const approved = pairs.filter((p) => byId.get(p.pairId)?.decision === "approved");
  const sources = sortSources([...approved.map(toSource), ...recordSources(orphans)]);
  return {
    sources,
    problems: flattenProblems(sources),
    unreadable: unreadableFiles(entries),
    corruptDecisions: load.corrupt,
  };
}

/**
 * The AI side when it is there; when it is gone, the AI name the naming rule
 * expects beside the reference — the row keeps its identity and its artifact
 * path, and the status says what is missing (design D4). A pair is never dropped.
 */
function toSource(pair: ReviewPair): SvgSource {
  const ai = pair.ai;
  const relPath = ai ? ai.relPath : expectedAiPath(pair);
  const name = baseName(relPath);
  return {
    id: pair.pairId,
    name,
    stem: stemOf(name),
    relPath,
    dirPath: pair.relDir,
    fingerprint: ai ? `${ai.size}:${ai.mtime}` : "missing",
    problems: problemsOf(pair),
  };
}

/** `architecture/court.png` -> `architecture/court_AI.png` (single-piece rule). */
function expectedAiPath(pair: ReviewPair): string {
  const name = baseName(pair.source?.relPath ?? pair.base);
  const stem = stemOf(name);
  const ai = `${stem}_AI${name.slice(stem.length)}`;
  return pair.relDir === "" ? ai : `${pair.relDir}/${ai}`;
}

/** Approved pairs the disk no longer holds: the record is their only trace. */
function recordSources(orphans: ReviewRecord[]): SvgSource[] {
  return orphans.flatMap((r) => (r.decision === "approved" ? [recordSource(r)] : []));
}

function recordSource(r: ReviewRecord): SvgSource {
  const relPath = r.ai_result ?? r.source ?? r.pair_id;
  const name = baseName(relPath);
  return {
    id: r.pair_id,
    name,
    stem: stemOf(name),
    relPath,
    dirPath: relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "",
    fingerprint: "missing",
    problems: [{
      kind: "files-missing", relPath: null,
      reason: `only the decision record remains for ${relPath}`,
    }],
  };
}

function flattenProblems(sources: SvgSource[]): SourceProblem[] {
  return sources.flatMap((s) => s.problems.map((p) => ({ id: s.id, ...p })));
}

/** Every file the walk could not read, with the reason, in path order. */
function unreadableFiles(entries: FileEntry[]): FileProblem[] {
  return entries
    .filter((e) => e.error !== null)
    .map((e) => ({ relPath: e.relPath, reason: unreadableReason(e.relPath) }))
    .sort((a, b) => compareNames(a.relPath, b.relPath));
}

/** Path order, so a rescan always yields the same list (prompt §2). */
function sortSources(sources: SvgSource[]): SvgSource[] {
  return [...sources].sort((a, b) => compareNames(a.relPath, b.relPath) || compareNames(a.id, b.id));
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The batch view of a source: stable identity beside the manifest name. */
export function toBatchSource(s: SvgSource): BatchSource {
  return { sourceId: s.id, name: s.stem, relPath: s.relPath, fingerprint: s.fingerprint };
}

/** The stable id a source keeps even if its folder is renamed away. */
export function sourceIdOf(dirPath: string, stem: string): string {
  return pairId(dirPath, stem, "");
}
