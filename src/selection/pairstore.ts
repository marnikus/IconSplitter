// pairstore.ts — reading and writing the pair files of a walk (I-41/I-42/I-43).
// The only module that touches disk for a decision. It reads every `<stem>.svg.json`
// the walk found (each one is a pair's own record: decision + SVG history),
// still reads the legacy global `review-decisions.json` as a fallback for pairs
// that have no local record, and writes ONE pair's file through the
// tmp → verify → overwrite → cleanup protocol. A file that cannot be read is
// named, never guessed; a file that cannot be written throws, so the caller
// keeps the decision in memory and can retry exactly that pair.

import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { parseAiName } from "../lib/naming";
import { pairId, type ReviewPair, type SideRef } from "../lib/pairing";
import {
  metaPathFor, metaPathForAi, newPairMeta, parsePairMeta, serializePairMeta, toRecord, withDecision,
  type PairIdentity, type PairMeta, type PairSide,
} from "../lib/pairmeta";
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
  const corruptFiles: string[] = [];
  for (const relPath of pairFilePaths(entries)) await readInto(root, relPath, metas, corruptFiles);
  const legacy = await readLegacy(root);
  return {
    metas,
    records: mergeRecords(metas, legacy.records),
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

async function readInto(root: DirHandleLike, relPath: string, metas: Map<string, PairMeta>, corrupt: string[]): Promise<void> {
  const read = await loadMetaAt(root, relPath);
  if (read.missing) return;
  if (read.corrupt || read.meta === null) {
    corrupt.push(relPath);
    return;
  }
  if (!metas.has(read.meta.id)) metas.set(read.meta.id, read.meta); // first in path order wins
}

export interface MetaRead {
  meta: PairMeta | null;
  corrupt: boolean;
  missing: boolean;
}

/** Reads one pair file by its path relative to the root. */
export async function loadMetaAt(root: DirHandleLike, relPath: string): Promise<MetaRead> {
  const dir = await dirAt(root, relPath);
  if (dir === null) return { meta: null, corrupt: false, missing: true };
  const fh = await tryGetFile(dir.dir, dir.name);
  if (!fh) return { meta: null, corrupt: false, missing: true };
  let text: string;
  try {
    text = await (await fh.getFile()).text();
  } catch {
    return { meta: null, corrupt: true, missing: false }; // exists but unreadable
  }
  const parsed = parsePairMeta(text);
  return parsed.ok ? { meta: parsed.meta, corrupt: false, missing: false } : { meta: null, corrupt: true, missing: false };
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

/**
 * The pair file to write for a scanned pair: the decision the state holds (a
 * pending pair owns no record, I-13) added to the record already on disk, so
 * neither half can overwrite the other (I-41).
 */
export function metaForRecord(records: readonly ReviewRecord[], pair: ReviewPair, base: PairMeta): PairMeta {
  const rec = records.find((r) => r.pair_id === pair.pairId);
  return withDecision(base, rec?.decision ?? "pending", rec?.reviewed_at ?? "");
}

/** A fresh pair file for a scanned pair that has none yet. */
export function metaFor(pair: ReviewPair): PairMeta {
  return newPairMeta({
    id: pair.pairId, base: pair.base, suffix: pair.suffix, dirPath: pair.relDir,
    ai: pair.ai === null ? sideNameOf(pair) : { relPath: pair.ai.relPath, name: baseName(pair.ai.relPath), fingerprint: fp(pair.ai) },
    source: pair.source === null ? null : { relPath: pair.source.relPath, name: baseName(pair.source.relPath), fingerprint: fp(pair.source) },
  });
}

function sideNameOf(pair: ReviewPair): PairSide {
  const from = pair.source?.relPath ?? "";
  const ext = from.includes(".") ? from.slice(from.lastIndexOf(".")) : ".png";
  return { relPath: "", name: `${pair.base}_AI${pair.suffix}${ext}`, fingerprint: "" };
}

function fp(side: SideRef): string {
  return `${side.size}:${side.mtime}`;
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/**
 * Where a decision record's pair file lives. Derived from the record's own paths
 * (the AI image when it has one, else the reference's AI name), so an undo from
 * another tab finds the file without a scan. A reference-only pair that carried
 * a batch suffix cannot be located from the record alone — the caller that saw
 * the pair uses `savePairDecision` instead.
 */
export function metaPathOf(rec: ReviewRecord): string {
  if (rec.ai_result !== null && rec.ai_result !== "") return metaPathForAi(rec.ai_result);
  if (rec.source !== null && rec.source !== "") return metaPathForAi(aiNameOf(rec.source));
  return "";
}

/** "split_01/icon.png" -> "split_01/icon_AI.png" (the name a healthy AI side has). */
function aiNameOf(sourceRelPath: string): string {
  const name = baseName(sourceRelPath);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : ".png";
  const base = parseAiName(name) ? stem.slice(0, -3) : stem;
  return `${base}_AI${ext}`;
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

/**
 * A pair file rebuilt from a record alone — the legacy/undo path, when the file
 * is missing or unreadable. The AI path names the identity (a record always
 * carries the AI path for a pair that has one); a reference-only record falls
 * back to its own pair id.
 */
export function metaFromRecord(rec: ReviewRecord): PairMeta {
  const identity = identityFromRecord(rec);
  return withDecision(newPairMeta({
    ...identity,
    source: rec.source === null ? null : { relPath: rec.source, name: baseName(rec.source), fingerprint: "" },
  }), rec.decision, rec.reviewed_at);
}

/** The half a record can always name: the identity and the AI face. */
function identityFromRecord(rec: ReviewRecord): PairIdentity & { ai: PairSide } {
  const aiRel = rec.ai_result ?? "";
  const name = aiRel === "" ? "" : baseName(aiRel);
  const parsed = name === "" ? null : parseAiName(name);
  const dirPath = aiRel === "" ? dirOf(rec.source ?? "") : dirOf(aiRel);
  return {
    id: rec.pair_id,
    base: parsed?.base ?? rec.pair_id,
    suffix: parsed?.suffix ?? "",
    dirPath,
    ai: { relPath: aiRel, name, fingerprint: "" },
  };
}

function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at < 0 ? "" : relPath.slice(0, at);
}

/** True when the record can be turned into a pair file (used by the writers). */
export function locatable(rec: ReviewRecord): boolean {
  return metaPathOf(rec) !== "";
}

/** Side identity a writer can rebuild from a path alone (pairing helper). */
export function identityOfPaths(dirPath: string, aiName: string): string {
  const parsed = parseAiName(aiName);
  return pairId(dirPath, parsed?.base ?? aiName, parsed?.suffix ?? "");
}
