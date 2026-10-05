// pairfile.ts — ONE pair file on disk (I-41/I-42/I-43): where it lives, how it is
// read, how it is written, and how it is rebuilt from a decision record. The walk
// that finds the files is pairstore.ts; this module owns the file itself, so the
// scan and every writer share exactly one reader and one tmp → verify →
// overwrite → cleanup protocol. A file that cannot be read is named, never
// guessed; a write that fails throws, so the caller keeps the decision in memory
// and can retry exactly that pair.

import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { parseAiName } from "../lib/naming";
import type { ReviewPair, SideRef } from "../lib/pairing";
import {
  metaPathFor, metaPathForAi, newPairMeta, parsePairMeta, serializePairMeta, withDecision,
  type PairIdentity, type PairMeta, type PairSide,
} from "../lib/pairmeta";
import type { ReviewRecord } from "../lib/reviewfile";

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
