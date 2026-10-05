// pairstore.ts — the decisions of ONE WALK (I-41/I-42/I-43): every
// `<stem>.svg.json` the walk found (a pair's own record: decision + SVG history)
// and the legacy global `review-decisions.json` as the fallback for pairs that
// have no local file of their own. pairfile.ts owns the file itself (read one,
// write one, rebuild one); this module owns WHICH files the walk means and what
// the list applies, including the identity rule that makes a decision mean the
// same thing at every level of the tree (I-44). A file that cannot be read is
// named, never guessed.

import { tryGetFile, type DirHandleLike } from "../lib/fs";
import { pairEntries, type ReviewPair, type SideRef } from "../lib/pairing";
import { forPair, metaPathFor, toRecord, type PairMeta, type PairSide } from "../lib/pairmeta";
import { parseDecisions, type ReviewRecord } from "../lib/reviewfile";
import type { FileEntry } from "../lib/scan";
import { loadMetaAt } from "./pairfile";

/** The one global file older builds wrote; read-only from here on. */
export const LEGACY_FILE = "review-decisions.json";

export interface PairLoad {
  /** pair id (of THIS walk, I-44) -> the record its own file holds (first file wins). */
  metas: Map<string, PairMeta>;
  /** The decisions the list applies: local files first, legacy as the fallback. */
  records: ReviewRecord[];
  /** Pair files that exist but could not be parsed, by relative path. */
  corruptFiles: string[];
  /** A legacy global file was found and read (its records are in use). */
  legacy: boolean;
  /** A legacy global file exists but is not readable — decisions kept in memory. */
  legacyCorrupt: boolean;
}

/**
 * Reads every pair file of a walk, then the legacy file for what is missing.
 * A pair file answers for the pair it SITS BESIDE (I-44): its path is resolved
 * against this walk's pairs, so the file keeps working after the same tree is
 * opened at another level, and a file whose pair is not on disk falls back to
 * the identity it stores.
 */
export async function loadPairDecisions(root: DirHandleLike, entries: readonly FileEntry[]): Promise<PairLoad> {
  const pairs = pairEntries(entries);
  const byFile = pairFileIndex(pairs);
  const sink: LoadSink = { metas: new Map(), corrupt: [] };
  for (const relPath of pairFilePaths(entries)) await readInto(root, relPath, byFile.get(relPath) ?? null, sink);
  const legacy = await readLegacy(root);
  return {
    metas: sink.metas,
    records: mergeRecords(sink.metas, legacy.records),
    corruptFiles: sink.corrupt,
    legacy: legacy.found && !legacy.corrupt,
    legacyCorrupt: legacy.corrupt,
  };
}

/** pair file path (this walk's) -> the pair that owns it (I-44). */
function pairFileIndex(pairs: readonly ReviewPair[]): Map<string, ReviewPair> {
  const byFile = new Map<string, ReviewPair>();
  for (const pair of pairs) {
    const at = metaPathFor(pair);
    if (at !== "") byFile.set(at, pair);
  }
  return byFile;
}

/** The pair files in a walk, in path order so a rescan is identical every time. */
function pairFilePaths(entries: readonly FileEntry[]): string[] {
  return entries
    .filter((e) => e.name.toLowerCase().endsWith(".svg.json"))
    .map((e) => e.relPath)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface LoadSink {
  /** pair id (of this walk) -> the record its own file holds (first file wins). */
  metas: Map<string, PairMeta>;
  /** Pair files that exist but could not be parsed, by relative path. */
  corrupt: string[];
}

async function readInto(root: DirHandleLike, relPath: string, owner: ReviewPair | null, sink: LoadSink): Promise<void> {
  const read = await loadMetaAt(root, relPath);
  if (read.missing) return;
  if (read.corrupt || read.meta === null) {
    sink.corrupt.push(relPath);
    return;
  }
  const meta = owner === null ? read.meta : forPair(read.meta, owner); // the walk's paths win
  if (!sink.metas.has(meta.id)) sink.metas.set(meta.id, meta); // first in path order wins
}

interface LegacyLoad {
  found: boolean;
  corrupt: boolean;
  records: ReviewRecord[];
}

async function readLegacy(root: DirHandleLike): Promise<LegacyLoad> {
  const fh = await tryGetFile(root, LEGACY_FILE);
  if (!fh) return { found: false, corrupt: false, records: [] };
  const parsed = parseDecisions(await (await fh.getFile()).text());
  return parsed.ok
    ? { found: true, corrupt: false, records: parsed.records }
    : { found: true, corrupt: true, records: [] };
}

/**
 * The records to apply. A pair's own file speaks for it whenever it carries a
 * decision (an explicit `pending` is a decision: a reset must outlive the legacy
 * record); a file with no decision yet — a freshly generated pair — lets the
 * legacy record through, so an approval is never lost to the migration.
 */
function mergeRecords(metas: Map<string, PairMeta>, legacy: readonly ReviewRecord[]): ReviewRecord[] {
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
  // A pair file owns its pair's id (of THIS walk): the legacy file is only the
  // fallback for pairs nothing local answered for. A legacy record whose id no
  // longer matches a moved pair is NOT swallowed here — the list reports it as
  // the duplicate it is, which is exactly what the audit exists for (I-32/I-33).
  //
  // One exception, and it is a rule, not a courtesy: a pair file that says
  // `pending` is a decision (I-13/I-42), so no legacy record may speak for the
  // files it names — not even one carrying an older id (reported 2026-10-05:
  // the reset vanished when the record's id stopped matching the walk's).
  const covered = new Set([...metas.keys()]);
  const reset = resetFiles(metas);
  for (const r of legacy) if (!covered.has(r.pair_id) && !reset.has(pathOf(r))) out.push(r);
  return out.sort((a, b) => (a.pair_id < b.pair_id ? -1 : 1));
}

/** The file paths a pair file with an explicit `pending` decision speaks for. */
function resetFiles(metas: Map<string, PairMeta>): Set<string> {
  const out = new Set<string>();
  for (const meta of metas.values()) {
    if (meta.decision !== "pending") continue;
    if (meta.ai.relPath !== "") out.add(meta.ai.relPath);
    if (meta.source !== null && meta.source.relPath !== "") out.add(meta.source.relPath);
  }
  return out;
}

/** The file a legacy record names (the AI result, else the reference). */
function pathOf(r: ReviewRecord): string {
  if (r.ai_result !== null && r.ai_result !== "") return r.ai_result;
  return r.source ?? "";
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

