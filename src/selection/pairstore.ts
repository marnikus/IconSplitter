// pairstore.ts — reading and writing the pair files of a walk (I-41/I-42/I-43).
// The only module that touches disk for a decision. It reads every `<stem>.svg.json`
// the walk found (each one is a pair's own record: decision + SVG history),
// still reads the legacy global `review-decisions.json` as a fallback for pairs
// that have no local record, and writes ONE pair's file through the
// tmp → verify → overwrite → cleanup protocol. A file that cannot be read is
// named, never guessed; a file that cannot be written throws, so the caller
// keeps the decision in memory and can retry exactly that pair.

import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { ReviewPair, SideRef } from "../lib/pairing";
import {
  metaPathFor, parsePairMeta, serializePairMeta, toRecord, type PairMeta, type PairSide,
} from "../lib/pairmeta";
import { rebaseMeta } from "../lib/pairrebase";
import { parseDecisions, type ReviewRecord } from "../lib/reviewfile";
import type { FileEntry } from "../lib/scan";

/** The one global file older builds wrote; read-only from here on. */
export const LEGACY_FILE = "review-decisions.json";

export interface PairLoad {
  /** pair id -> the record its own file holds (first file wins, in path order). */
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

/** Reads every pair file of a walk, then the legacy file for what is missing. */
export async function loadPairDecisions(root: DirHandleLike, entries: readonly FileEntry[]): Promise<PairLoad> {
  const metas = new Map<string, PairMeta>();
  const carried = new Map<string, string>(); // rebased id -> the id the file itself named
  const corruptFiles: string[] = [];
  for (const relPath of pairFilePaths(entries)) await readInto(root, relPath, { metas, carried, corrupt: corruptFiles });
  const legacy = await readLegacy(root);
  return {
    metas,
    records: mergeRecords(metas, carried, legacy.records),
    corruptFiles,
    legacy: legacy.found && !legacy.corrupt,
    legacyCorrupt: legacy.corrupt,
  };
}

/** The pair files in a walk, in path order so a rescan is identical every time. */
function pairFilePaths(entries: readonly FileEntry[]): string[] {
  return entries
    .filter((e) => e.name.toLowerCase().endsWith(".svg.json"))
    .map((e) => e.relPath)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** What a walk collects: the metas by rebased id, and any id a file carried. */
interface PairReads {
  metas: Map<string, PairMeta>;
  carried: Map<string, string>;
  corrupt: string[];
}

async function readInto(root: DirHandleLike, relPath: string, into: PairReads): Promise<void> {
  const read = await loadMetaAt(root, relPath);
  if (read.missing) return;
  if (read.corrupt || read.meta === null) {
    into.corrupt.push(relPath);
    return;
  }
  if (into.metas.has(read.meta.id)) return; // first in path order wins
  into.metas.set(read.meta.id, read.meta);
  if (read.storedId !== read.meta.id) into.carried.set(read.meta.id, read.storedId);
}

export interface MetaRead {
  meta: PairMeta | null;
  /** The id the file itself carries — the legacy file still names a pair that way (I-42). */
  storedId: string;
  corrupt: boolean;
  missing: boolean;
}

/**
 * Reads one pair file by its path relative to the root, rebased onto THIS root
 * (I-49): the file is read where it sits, so its identity and its faces describe
 * the pair as this root sees it. Without that, an approval made while another
 * root was picked is invisible here (a different pair id, paths that do not
 * resolve) — the reported "0 items" in Generate SVG.
 */
export async function loadMetaAt(root: DirHandleLike, relPath: string): Promise<MetaRead> {
  const dir = await dirAt(root, relPath);
  if (dir === null) return { meta: null, storedId: "", corrupt: false, missing: true };
  const fh = await tryGetFile(dir.dir, dir.name);
  if (!fh) return { meta: null, storedId: "", corrupt: false, missing: true };
  let text: string;
  try {
    text = await (await fh.getFile()).text();
  } catch {
    return { meta: null, storedId: "", corrupt: true, missing: false }; // exists but unreadable
  }
  const parsed = parsePairMeta(text);
  if (!parsed.ok) return { meta: null, storedId: "", corrupt: true, missing: false };
  const meta = rebaseMeta(parsed.meta, dirOfRel(relPath));
  return { meta, storedId: parsed.meta.id, corrupt: false, missing: false };
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
function mergeRecords(metas: Map<string, PairMeta>, carried: ReadonlyMap<string, string>, legacy: readonly ReviewRecord[]): ReviewRecord[] {
  const byLegacy = new Map(legacy.map((r) => [r.pair_id, r]));
  const out: ReviewRecord[] = [];
  for (const meta of sortedMetas(metas)) {
    const own = toRecord(meta, pairRefOf(meta));
    if (own !== null) out.push(own);
    else if (meta.decision === null) {
      // a file rebased onto this root keeps answering for the id it carried (I-49)
      const fallback = byLegacy.get(meta.id) ?? byLegacy.get(carried.get(meta.id) ?? "");
      if (fallback) out.push(fallback);
    }
  }
  const covered = new Set([...metas.keys(), ...carried.values()]);
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

/**
 * Writes ONE pair's file beside its images. Throws when the pair cannot own a
 * file (no name to give it) or the write fails, so the caller keeps the decision
 * in memory and retries exactly this pair.
 */
export async function savePairDecision(root: DirHandleLike, pair: ReviewPair, meta: PairMeta): Promise<void> {
  const relPath = metaPathFor(pair);
  if (relPath === "") throw new Error("the pair has no file name");
  await saveMetaAt(root, relPath, meta);
}

/** Writes a pair file at an explicit path (generation, review, undo). */
export async function saveMetaAt(root: DirHandleLike, relPath: string, meta: PairMeta): Promise<void> {
  const dir = await dirAt(root, relPath);
  if (dir === null) throw new Error("the pair's folder is gone");
  const text = serializePairMeta(meta);
  const tmp = tmpName(dir.name);
  await writeAndVerify(dir.dir, tmp, text);
  await writeFileOverwrite(dir.dir, dir.name, new Blob([text]));
  await removeTmp(dir.dir, tmp);
}

/** The directory part of a root-relative path ("" when the file sits at the root). */
function dirOfRel(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

interface AtDir {
  dir: DirHandleLike;
  name: string;
}

async function dirAt(root: DirHandleLike, relPath: string): Promise<AtDir | null> {
  const at = relPath.lastIndexOf("/");
  if (at < 0) return { dir: root, name: relPath };
  const dir = await probePath(root, relPath.slice(0, at));
  return dir === null ? null : { dir, name: relPath.slice(at + 1) };
}

function tmpName(fileName: string): string {
  return fileName.replace(/\.svg\.json$/i, ".svg.tmp.json");
}

async function writeAndVerify(dir: DirHandleLike, name: string, text: string): Promise<void> {
  const tmp = await dir.getFileHandle(name, { create: true });
  const w = await tmp.createWritable();
  await w.write(new Blob([text]));
  await w.close();
  const back = await (await tmp.getFile()).text();
  if (!parsePairMeta(back).ok) throw new Error("pair file tmp verify failed");
}

async function removeTmp(dir: DirHandleLike, name: string): Promise<void> {
  try {
    await dir.removeEntry?.(name);
  } catch {
    // a leftover tmp is harmless — the next save overwrites it
  }
}

