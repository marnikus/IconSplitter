// pairing.ts — pure source/AI pairing for Selection review (RULE 3, RULE 8).
// Owns: classifying scan entries into image pairs, stable pair ids, duplicate
// suppression, unpaired-side flags and rename identity keys. No IO (RULE 1).

import { isImageExt, parseAiName, referenceName } from "./naming";
import type { FileEntry } from "./scan";

/** One side of a pair: the file that actually exists on disk. */
export interface SideRef {
  relPath: string;
  size: number;
  mtime: number;
}

/** A discovered original/AI-result pair; a side is null when missing. */
export interface ReviewPair {
  pairId: string;
  base: string; // file name stem shared by both sides
  relDir: string; // folder relative to the scanned root ("" at root)
  source: SideRef | null;
  ai: SideRef | null;
  created: number; // source mtime (File API has no birth time) else AI mtime
  generated: number | null; // AI mtime when the AI file exists
}

/** Builds the pair list from a recursive scan (walkTree output). */
export function pairEntries(entries: FileEntry[]): ReviewPair[] {
  const sources = indexSources(entries);
  const byId = new Map<string, ReviewPair>();
  for (const e of entries) addAiPair(e, sources, byId);
  addOrphanSources(entries, sources, byId);
  return [...byId.values()];
}

type SourceMap = Map<string, FileEntry>; // lower relPath -> entry

function indexSources(entries: FileEntry[]): SourceMap {
  const map: SourceMap = new Map();
  for (const e of entries) {
    if (!isImageFile(e.name)) continue;
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
  const src = sources.get(srcPath(e, ai.base, ai.ext).toLowerCase()) ?? null;
  const pair: ReviewPair = {
    pairId: pairId(e.dirPath, ai.base, ai.suffix),
    base: ai.base,
    relDir: e.dirPath,
    source: src ? toSide(src) : null,
    ai: toSide(e),
    created: src ? src.mtime : e.mtime,
    generated: e.mtime,
  };
  if (!out.has(pair.pairId)) out.set(pair.pairId, pair); // no duplicates
}

function addOrphanSources(entries: FileEntry[], sources: SourceMap, out: Map<string, ReviewPair>): void {
  const pairedSrc = new Set([...out.values()].map((p) => p.source?.relPath.toLowerCase()));
  for (const e of entries) {
    if (!sources.has(e.relPath.toLowerCase()) || pairedSrc.has(e.relPath.toLowerCase())) continue;
    const base = stem(e.name);
    out.set(pairId(e.dirPath, base, ""), {
      pairId: pairId(e.dirPath, base, ""),
      base,
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
  return { relPath: e.relPath, size: e.size, mtime: e.mtime };
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

/** FNV-1a 32-bit — small, stable, dependency-free string hash. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
