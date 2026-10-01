// review.ts — discovers source ↔ AI-result pairs in a recursive scan (spec §1).
// Owns: pair identity (pairId), the pairing rules over walkTree entries, and
// the pair-level diff a rescan reports. One pair per AI file: several _AI
// variants of one base share the source, a base without an AI file becomes a
// "source-only" pair, an AI file without a source an "ai-only" pair.
// Pure module: the tree comes from src/lib/scan.ts.

import { isImageExt, parseAiName } from "./naming";
import type { FileEntry } from "./scan";
import { compareText } from "./text";

export type PairKind = "paired" | "ai-only" | "source-only";

/** One side of a pair, as it exists on disk. */
export interface PairSide {
  relPath: string;
  name: string;
  size: number;
  mtime: number;
}

export interface ReviewPair {
  id: string; // stable pair id, see pairId()
  dirPath: string; // relative folder ("" at the root)
  base: string; // source base name without extension
  variant: number | null; // _AI_7 → 7, plain _AI → null
  kind: PairKind;
  source: PairSide | null; // null ⇒ "Original missing"
  ai: PairSide | null; // null ⇒ "AI result missing"
  createdAt: number; // newest side mtime; created *or* regenerated (spec §3)
}

/** Identity of a pair: lowercased folder/base plus the AI variant. */
export function pairId(dirPath: string, base: string, variant: number | null): string {
  const path = dirPath === "" ? base : `${dirPath}/${base}`;
  return (variant === null ? path : `${path}#${variant}`).toLowerCase();
}

interface PairIndex {
  pairs: Map<string, ReviewPair>;
  sources: Map<string, PairSide[]>;
  claimed: Set<string>;
}

export function buildPairs(entries: FileEntry[]): ReviewPair[] {
  const index: PairIndex = { pairs: new Map(), sources: indexSources(entries), claimed: new Set() };
  for (const entry of entries) addAiPair(index, entry);
  for (const entry of entries) addSourcePair(index, entry);
  return [...index.pairs.values()].sort(comparePairs);
}

/** Every non-AI image, grouped by folder + base name so any extension matches. */
function indexSources(entries: FileEntry[]): Map<string, PairSide[]> {
  const sources = new Map<string, PairSide[]>();
  for (const entry of entries) {
    if (parseAiName(entry.name) !== null || !isImageExt(extensionOf(entry.name))) continue;
    const key = sourceKey(entry.dirPath, stemOf(entry.name));
    sources.set(key, [...(sources.get(key) ?? []), sideOf(entry)]);
  }
  return sources;
}

function addAiPair(index: PairIndex, entry: FileEntry): void {
  const ai = parseAiName(entry.name);
  if (!ai || !isImageExt(ai.ext)) return;
  const id = pairId(entry.dirPath, ai.base, ai.variant);
  const pair = index.pairs.get(id) ?? blankPair(id, entry.dirPath, ai.base, ai.variant);
  pair.ai = sideOf(entry);
  const source = pair.source ?? pickSource(index.sources.get(sourceKey(entry.dirPath, ai.base)), ai.ext);
  if (source) {
    pair.source = source;
    index.claimed.add(source.relPath.toLowerCase());
  }
  pair.kind = kindOf(pair);
  pair.createdAt = pairTime(pair);
  index.pairs.set(id, pair);
}

function addSourcePair(index: PairIndex, entry: FileEntry): void {
  if (parseAiName(entry.name) !== null || !isImageExt(extensionOf(entry.name))) return;
  const id = pairId(entry.dirPath, stemOf(entry.name), null);
  if (index.claimed.has(entry.relPath.toLowerCase()) || index.pairs.has(id)) return;
  const pair = blankPair(id, entry.dirPath, stemOf(entry.name), null);
  pair.source = sideOf(entry);
  pair.kind = "source-only";
  pair.createdAt = pairTime(pair);
  index.pairs.set(id, pair);
}

/** Prefers the candidate sharing the AI file's extension, then path order. */
function pickSource(candidates: PairSide[] | undefined, ext: string): PairSide | null {
  if (!candidates || candidates.length === 0) return null;
  const sameExt = candidates.find((c) => c.name.toLowerCase().endsWith(ext.toLowerCase()));
  return sameExt ?? [...candidates].sort((a, b) => compareText(a.relPath, b.relPath))[0];
}

export interface PairDiff {
  added: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
  changed: string[];
  kept: number;
}

/** Compares two scans so a rescan can report exactly what moved (spec §9). */
export function diffPairs(prev: ReviewPair[], next: ReviewPair[]): PairDiff {
  const before = new Map(prev.map((p) => [p.id, p]));
  const after = new Map(next.map((p) => [p.id, p]));
  const gone = prev.filter((p) => !after.has(p.id));
  const fresh = next.filter((p) => !before.has(p.id));
  const renamed = matchRenamed(gone, fresh);
  const renamedIds = new Set(renamed.flatMap((r) => [r.from, r.to]));
  const shared = next.filter((p) => before.has(p.id));
  const changed = shared.filter((p) => !samePair(before.get(p.id)!, p));
  return {
    added: fresh.map((p) => p.id).filter((id) => !renamedIds.has(id)),
    removed: gone.map((p) => p.id).filter((id) => !renamedIds.has(id)),
    renamed,
    changed: changed.map((p) => p.id),
    kept: shared.length - changed.length,
  };
}

/** A rename keeps size+mtime of both sides but changes the folder/base. */
function matchRenamed(gone: ReviewPair[], fresh: ReviewPair[]): { from: string; to: string }[] {
  const used = new Set<string>();
  const out: { from: string; to: string }[] = [];
  for (const old of gone) {
    const twin = fresh.find((n) => !used.has(n.id) && sameBytes(old, n));
    if (!twin) continue;
    used.add(twin.id);
    out.push({ from: old.id, to: twin.id });
  }
  return out;
}

function sameBytes(a: ReviewPair, b: ReviewPair): boolean {
  return bytesOf(a.source) === bytesOf(b.source) && bytesOf(a.ai) === bytesOf(b.ai);
}

function bytesOf(side: PairSide | null): string {
  return side === null ? "none" : `${side.size}:${side.mtime}`;
}

function samePair(a: ReviewPair, b: ReviewPair): boolean {
  return sameSide(a.source, b.source) && sameSide(a.ai, b.ai);
}

function sameSide(a: PairSide | null, b: PairSide | null): boolean {
  if (a === null || b === null) return a === b;
  return a.relPath.toLowerCase() === b.relPath.toLowerCase() && a.size === b.size && a.mtime === b.mtime;
}

function blankPair(id: string, dirPath: string, base: string, variant: number | null): ReviewPair {
  return { id, dirPath, base, variant, kind: "source-only", source: null, ai: null, createdAt: 0 };
}

function kindOf(pair: ReviewPair): PairKind {
  if (pair.source !== null && pair.ai !== null) return "paired";
  return pair.ai !== null ? "ai-only" : "source-only";
}

function pairTime(pair: ReviewPair): number {
  return Math.max(pair.source?.mtime ?? 0, pair.ai?.mtime ?? 0);
}

function sideOf(entry: FileEntry): PairSide {
  return { relPath: entry.relPath, name: entry.name, size: entry.size, mtime: entry.mtime };
}

function comparePairs(a: ReviewPair, b: ReviewPair): number {
  return (
    compareText(a.dirPath, b.dirPath) ||
    compareText(a.base, b.base) ||
    variantRank(a.variant) - variantRank(b.variant) ||
    compareText(a.id, b.id)
  );
}

function variantRank(variant: number | null): number {
  return variant === null ? -1 : variant;
}

function sourceKey(dirPath: string, base: string): string {
  return pairId(dirPath, base, null);
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i);
}

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}
