// svgextract.ts — turning a provider answer back into SVG documents (prompt §6/§7/§9).
// Owns: splitting the response into SVG blocks (fenced code blocks or raw
// markup), reading the position id and the <title> out of each block, and
// matching blocks to the ordered manifest by NAME first and position second.
// Nothing is ever assigned by appearance, and a duplicate/unknown/out-of-range
// id is reported instead of guessed at.

import type { ManifestItem } from "./svgbatch";

export interface SvgBlock {
  /** Position id declared by the answer ("1 —", "Position 1", "#1"), if any. */
  position: number | null;
  /** <title> inside the SVG, when the model supplied one. */
  title: string | null;
  code: string;
}

export interface MatchResult {
  ok: boolean;
  /** position -> validated-able SVG source, for the positions that matched. */
  byPosition: Map<number, string>;
  /** Manifest positions with no usable result. */
  missing: number[];
  problems: string[];
}

const FENCE = /```[ \t]*([\w-]*)[ \t]*\r?\n([\s\S]*?)```/g;
const RAW_SVG = /<svg\b[\s\S]*?<\/svg>/gi;
const HEAD_NUM = /(?:^|\n)[ \t]*(?:#\s*)?(?:position\s*)?(\d{1,2})\s*[).:–—-]/i;

/** Every SVG-looking block in the answer, in the order the model produced them. */
export function extractSvgBlocks(text: string): SvgBlock[] {
  const fenced = [...text.matchAll(FENCE)].flatMap((m) => toBlock(m[2], m.index ?? 0, text));
  return fenced.length > 0 ? fenced : rawBlocks(text);
}

function rawBlocks(text: string): SvgBlock[] {
  return [...text.matchAll(RAW_SVG)].map((m) => ({
    position: null,
    title: readTitle(m[0]),
    code: trimSvg(m[0]),
  }));
}

function toBlock(body: string, at: number, text: string): SvgBlock[] {
  if (!/<svg\b/i.test(body)) return [];
  const code = trimSvg(body);
  if (code === "") return [];
  return [{ position: readHeadPosition(text.slice(0, at)), title: readTitle(code), code }];
}

/** Trims a block down to the SVG document itself — prose is never saved. */
export function trimSvg(block: string): string {
  const start = block.search(/<svg\b/i);
  const end = block.search(/<\/svg>/i);
  if (start < 0 || end < 0) return "";
  return block.slice(start, end + 6).trim();
}

/** The number a heading carries just before a block, e.g. "3) " or "Position 3:". */
export function readHeadPosition(head: string): number | null {
  const tail = head.slice(-80);
  const m = HEAD_NUM.exec(tail);
  return m ? Number(m[1]) : null;
}

export function readTitle(code: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(code);
  const title = m ? m[1].trim() : "";
  return title === "" ? null : title;
}

/** Same name, ignoring case and any extension the model appended. */
export function sameName(a: string, b: string): boolean {
  return stem(a).toLowerCase() === stem(b).toLowerCase();
}

function stem(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Matches blocks to the manifest. Title names win (they are explicit); the
 * declared position is the fallback. A block that matches neither is reported,
 * never guessed, so later results can never shift up into an empty slot.
 */
export function matchBlocks(blocks: readonly SvgBlock[], manifest: readonly ManifestItem[]): MatchResult {
  const byPosition = new Map<number, string>();
  const problems: string[] = [];
  for (const block of blocks) {
    const position = resolvePosition(block, manifest);
    if (position === null) {
      problems.push(`unmatched result: ${describe(block)}`);
      continue;
    }
    if (byPosition.has(position)) {
      problems.push(`duplicate result for position ${position}`);
      continue;
    }
    byPosition.set(position, block.code);
  }
  const missing = manifest.map((m) => m.position).filter((p) => !byPosition.has(p));
  return { ok: problems.length === 0 && missing.length === 0, byPosition, missing, problems };
}

function resolvePosition(block: SvgBlock, manifest: readonly ManifestItem[]): number | null {
  if (block.title !== null) {
    const hit = manifest.find((m) => sameName(m.name, block.title as string));
    if (hit) return hit.position;
  }
  const wanted = new Set(manifest.map((m) => m.position));
  return block.position !== null && wanted.has(block.position) ? block.position : null;
}

function describe(block: SvgBlock): string {
  if (block.title !== null) return `title "${block.title}"`;
  if (block.position !== null) return `position ${block.position}`;
  return "no position or title";
}
