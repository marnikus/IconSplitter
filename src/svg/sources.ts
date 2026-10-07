// sources.ts — approved-source discovery for the Generate SVG tab (prompt §1).
// Owns: the recursive scan of the picked root, keeping ONLY pairs the Selection
// workflow approved, and reporting what needs attention *on the pair* instead of
// removing it: a missing AI image, a missing reference, an unreadable file, or a
// pair only its decision record still remembers (design D4/D8). The scan writes
// nothing (D5) and its answer is a function of the file set (D1/D2).

import type { BatchSource } from "../lib/svgbatch";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { metaPathFor, newPairMeta, withDecision, type PairMeta } from "../lib/pairmeta";
import { compareNames, walkTree, type FileEntry } from "../lib/scan";
import { directoryNames, scopeOf } from "../lib/splitscope";
import { pairEntries, pairId, problemsOf, unreadableReason, type PairProblem } from "../lib/pairing";
import { loadPairDecisions } from "../selection/pairstore";
import {
  auditText, fileTally, selectRows,
  type RowPair, type ScanAudit, type SourceExclusion,
} from "./sourcelist";

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
  /** The pair's own file, relative to the root (I-41): decision + SVG history. */
  metaPath: string;
  /** The pair's identity, so a record can be rebuilt without a second walk. */
  base: string;
  suffix: string;
  sourcePath: string | null;
  sourceFingerprint: string | null;
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
  /** Every approved AI OUTPUT that exists on disk, one row per path (I-31/32). */
  sources: SvgSource[];
  /** Every listed source that needs attention, in source order. */
  problems: SourceProblem[];
  /**
   * Approved sources that are NOT listed, each with its reason: no AI image,
   * no files left, no AI result, or a duplicate path. Reported, never rows.
   */
  excluded: SourceExclusion[];
  /** The whole picture the list was checked against (I-33). */
  audit: ScanAudit;
  /** Files that could not be read (locked or being written) — not "changed". */
  unreadable: FileProblem[];
  /** Every pair file the walk found, by pair id — the versions rows show (I-41). */
  metas: Map<string, PairMeta>;
  /** Pair files that exist but could not be parsed, by path. */
  corruptFiles: string[];
  /** Every readable file the walk found: relPath -> "size:mtime". */
  fileIndex: Map<string, string>;
  /** The legacy global file could not be parsed — decisions kept in memory. */
  corruptDecisions: boolean;
}

/** Short status per problem kind, for the row (D8) — defined once in lib/pairing. */
export { PROBLEM_LABEL } from "../lib/pairing";

/** Scans the root and lists every approved AI output, in a deterministic order. */
export async function discoverApprovedSources(root: DirHandleLike): Promise<Discovery> {
  const tree = await readDirTree(root, []);
  // When the tree holds the batch's output, that is the reviewable set: the main
  // folder keeps the unsplit sheets, which are the batch's input (I-38).
  const rule = scopeOf(directoryNames(tree), root.name);
  const entries = walkTree(tree, []);
  const load = await loadPairDecisions(root, entries);
  const picked = selectRows(pairEntries(entries), load.records, rule.hideOutside);
  const sources = sortSources(picked.rows.map(toSource));
  return {
    sources,
    problems: flattenProblems(sources),
    excluded: picked.excluded,
    audit: { ...fileTally(entries), missing: picked.missing, duplicates: picked.duplicates, rows: sources.length },
    unreadable: unreadableFiles(entries),
    metas: load.metas,
    corruptFiles: load.corruptFiles,
    fileIndex: fileIndexOf(entries),
    corruptDecisions: load.legacyCorrupt,
  };
}

/** The audit line the source bar shows and the scan logs (one wording, I-33). */
export { auditText };

/** A listed row: its real AI file, never an invented name (I-31). */
function toSource(pair: RowPair): SvgSource {
  return {
    id: pair.pairId,
    name: baseName(pair.ai.relPath),
    stem: stemOf(baseName(pair.ai.relPath)),
    relPath: pair.ai.relPath,
    dirPath: pair.relDir,
    fingerprint: `${pair.ai.size}:${pair.ai.mtime}`,
    problems: problemsOf(pair),
    metaPath: metaPathFor(pair),
    base: pair.base,
    suffix: pair.suffix,
    sourcePath: pair.source?.relPath ?? null,
    sourceFingerprint: pair.source === null ? null : `${pair.source.size}:${pair.source.mtime}`,
  };
}

function flattenProblems(sources: SvgSource[]): SourceProblem[] {
  return sources.flatMap((s) => s.problems.map((p) => ({ id: s.id, ...p })));
}

/** relPath -> "size:mtime" for every readable file (the upload tab's checks). */
function fileIndexOf(entries: FileEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) if (e.error === null) out.set(e.relPath, `${e.size}:${e.mtime}`);
  return out;
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

/** The pair's file content for a source the list just discovered (I-41). */
export function metaForSource(source: SvgSource, existing: PairMeta | null): PairMeta {
  if (existing !== null) return existing;
  return newPairMeta({
    id: source.id, base: source.base, suffix: source.suffix, dirPath: source.dirPath,
    ai: { relPath: source.relPath, name: source.name, fingerprint: source.fingerprint },
    source: source.sourcePath === null
      ? null
      : { relPath: source.sourcePath, name: source.sourcePath.split("/").pop() ?? source.sourcePath, fingerprint: source.sourceFingerprint ?? "" },
  });
}

/** The pair decision recorded for a source (used by the panel's banners). */
export function decisionFor(meta: PairMeta | null, fallback: PairMeta): PairMeta {
  return withDecision(fallback, meta?.decision ?? "pending", meta?.reviewedAt ?? "");
}

/** The stable id a source keeps even if its folder is renamed away. */
export function sourceIdOf(dirPath: string, stem: string): string {
  return pairId(dirPath, stem, "");
}
