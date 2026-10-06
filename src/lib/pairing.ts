// pairing.ts — pure source/AI pairing for Selection review (RULE 3, RULE 8).
// Owns: classifying scan entries into image pairs, stable pair ids, unpaired-
// side flags, per-file problem reasons and rename identity keys. No IO (RULE 1).
// The result is a function of the entry SET: the filesystem's enumeration order
// must not change a pair, its AI side or the order of the list (design D2).

import { isImageExt, isVersionArtifact, parseAiName, referenceName } from "./naming";
import { compareNames, type FileEntry } from "./scan";

/** One side of a pair: the file that actually exists on disk. */
export interface SideRef {
  relPath: string;
  size: number;
  mtime: number;
  /** "unreadable" when this side could not be read; null when it could. */
  error: string | null;
}

/** A discovered original/AI-result pair; a side is null when missing. */
export interface ReviewPair {
  pairId: string;
  base: string; // file name stem shared by both sides
  suffix: string; // AI variation tail ("", "_7", "_9_01")
  relDir: string; // folder relative to the scanned root ("" at root)
  source: SideRef | null;
  ai: SideRef | null;
  created: number; // source mtime (File API has no birth time) else AI mtime
  generated: number | null; // AI mtime when the AI file exists
}

/** Why one file of a pair is not usable; `files-missing` = only the record is left. */
export type ProblemKind = "ai-missing" | "original-missing" | "unreadable" | "files-missing";

/** One per-file reason, shown on the row instead of hiding the pair (D4/D8). */
export interface PairProblem {
  kind: ProblemKind;
  /** The file the reason is about; null when the side is not on disk at all. */
  relPath: string | null;
  reason: string;
}

/** Builds the pair list from a recursive scan (walkTree output), in place order. */
export function pairEntries(entries: FileEntry[]): ReviewPair[] {
  const sources = indexSources(entries);
  const byId = new Map<string, ReviewPair>();
  for (const e of entries) addAiPair(e, sources, byId);
  addOrphanSources(entries, sources, byId);
  return [...byId.values()].sort(byPlace);
}

/** Stable, human order: folder, then base, then the AI variation suffix. */
function byPlace(a: ReviewPair, b: ReviewPair): number {
  return compareNames(a.relDir, b.relDir) || compareNames(a.base, b.base) || compareNames(a.suffix, b.suffix);
}

type SourceMap = Map<string, FileEntry>; // lower relPath -> entry

function indexSources(entries: FileEntry[]): SourceMap {
  const map: SourceMap = new Map();
  for (const e of entries) {
    if (!isImageFile(e.name) || isVersionArtifact(e.name)) continue;
    if (parseAiName(e.name)) continue; // AI files are not sources
    map.set(e.relPath.toLowerCase(), e);
  }
  return map;
}

function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && isImageExt(name.slice(dot));
}

function addAiPair(e: FileEntry, sources: SourceMap, out: Map<string, ReviewPair>): void {
  const ai = parseAiName(e.name);
  if (!ai || !isImageExt(ai.ext)) return;
  const pair = makePair(e, ai, sources);
  const held = out.get(pair.pairId);
  if (held === undefined || beats(pair, held)) out.set(pair.pairId, pair);
}

function makePair(e: FileEntry, ai: { base: string; suffix: string; ext: string }, sources: SourceMap): ReviewPair {
  const src = sources.get(srcPath(e, ai.base, ai.ext).toLowerCase()) ?? null;
  return {
    pairId: pairId(e.dirPath, ai.base, ai.suffix),
    base: ai.base,
    suffix: ai.suffix,
    relDir: e.dirPath,
    source: src ? toSide(src) : null,
    ai: toSide(e),
    created: src ? src.mtime : e.mtime,
    generated: e.mtime,
  };
}

/**
 * Which candidate owns a pair id: the raster the AI produced beats the `.svg`
 * artifact this app derives from it, then the path decides. A total order, so
 * the winner is independent of the order the candidates arrived in (D2).
 */
function beats(candidate: ReviewPair, held: ReviewPair): boolean {
  const rank = resultRank(candidate) - resultRank(held);
  if (rank !== 0) return rank < 0;
  return (candidate.ai?.relPath ?? "") < (held.ai?.relPath ?? "");
}

/** 0 = a raster result, 1 = the SVG artifact, 2 = a side that is gone. */
function resultRank(p: ReviewPair): number {
  if (p.ai === null) return 2;
  return p.ai.relPath.toLowerCase().endsWith(".svg") ? 1 : 0;
}

function addOrphanSources(entries: FileEntry[], sources: SourceMap, out: Map<string, ReviewPair>): void {
  const pairedSrc = new Set([...out.values()].map((p) => p.source?.relPath.toLowerCase()));
  for (const e of entries) {
    if (!sources.has(e.relPath.toLowerCase()) || pairedSrc.has(e.relPath.toLowerCase())) continue;
    const base = stem(e.name);
    out.set(pairId(e.dirPath, base, ""), {
      pairId: pairId(e.dirPath, base, ""),
      base,
      suffix: "",
      relDir: e.dirPath,
      source: toSide(e),
      ai: null,
      created: e.mtime,
      generated: null,
    });
  }
}

function srcPath(e: FileEntry, base: string, ext: string): string {
  const name = referenceName({ base, suffix: "", ext });
  return e.dirPath ? `${e.dirPath}/${name}` : name;
}

function toSide(e: FileEntry): SideRef {
  return { relPath: e.relPath, size: e.size, mtime: e.mtime, error: e.error };
}

function stem(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Stable id: hash of dir + base (+AI suffix); same content, same id. */
export function pairId(dirPath: string, base: string, suffix: string): string {
  return `pair_${fnv1a32(`${dirPath}/${base}${suffix}`.toLowerCase()).toString(16).padStart(8, "0")}`;
}

/** Rename/move identity: size+mtime of the surviving side (source preferred). */
export function identityKey(p: ReviewPair): string {
  const side = p.source ?? p.ai;
  return side ? `${side.size}:${side.mtime}` : "0:0";
}

/** Human-readable warning for incomplete pairs; null when both sides exist. */
export function attentionInfo(p: ReviewPair): string | null {
  if (!p.ai) return "AI result missing";
  if (!p.source) return "Original missing";
  return null;
}

/**
 * Per-file reasons a pair is not fully usable, in a fixed order (unreadable
 * sides first, then gone sides); empty for a healthy pair. A reason never
 * removes the pair — it is the status shown on its row (D4/D8).
 */
export function problemsOf(p: ReviewPair): PairProblem[] {
  const out: PairProblem[] = [];
  if (p.ai?.error) out.push(unreadable(p.ai));
  if (p.source?.error) out.push(unreadable(p.source));
  if (!p.ai) out.push({ kind: "ai-missing", relPath: null, reason: `no AI result (${aiResultName(p.source!.relPath)}) beside ${p.source!.relPath}` });
  if (!p.source) out.push({ kind: "original-missing", relPath: null, reason: `no reference image (${p.base}${extOf(p.ai!.relPath)}) beside ${p.ai!.relPath}` });
  return out;
}

function unreadable(side: SideRef): PairProblem {
  return { kind: "unreadable", relPath: side.relPath, reason: unreadableReason(side.relPath) };
}

/** One wording for "this file exists but could not be read" (row + banner). */
export function unreadableReason(relPath: string): string {
  return `${relPath} could not be read (locked or still being written)`;
}

/** "fog.png" -> "fog_AI.png": the result a healthy reference would have. */
function aiResultName(relPath: string): string {
  const name = baseName(relPath);
  const ext = extOf(name);
  return `${name.slice(0, name.length - ext.length)}_AI${ext}`;
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** FNV-1a 32-bit — small, stable, dependency-free string hash. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
