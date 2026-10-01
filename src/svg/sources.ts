// sources.ts — approved-source discovery for the Generate SVG tab (prompt §1).
// Owns: the recursive scan of the picked root, keeping ONLY pairs the Selection
// workflow approved, and reporting what could not be used (missing AI image,
// unreadable file, corrupt decision file) instead of dropping it silently.
// Stable pair ids are the file identity — never a row index.

import type { BatchSource } from "../lib/svgbatch";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import { walkTree } from "../lib/scan";
import { attentionInfo, pairEntries, pairId } from "../lib/pairing";
import { mergeDecisions } from "../lib/reviewfile";
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
  /** size:mtime fingerprint captured at scan time. */
  fingerprint: string;
}

export interface Discovery {
  sources: SvgSource[];
  /** Approved pairs whose AI image disappeared since the last scan. */
  missing: string[];
  /** Files that could not be read (size 0 in the scan tree). */
  unreadable: string[];
  /** review-decisions.json could not be parsed — decisions kept in memory. */
  corruptDecisions: boolean;
  approvedTotal: number;
}

/** Scans the root and keeps the approved pairs, in a deterministic order. */
export async function discoverApprovedSources(root: DirHandleLike): Promise<Discovery> {
  const tree = await readDirTree(root, []);
  const entries = walkTree(tree, []);
  const pairs = pairEntries(entries);
  const load = await loadDecisions(root);
  const { byId } = mergeDecisions(pairs, load.records);
  const found = splitApproved(pairs, byId);
  const unreadable = entries.filter((e) => e.size === 0 && e.name !== "").map((e) => e.relPath);
  return {
    sources: sortSources(found.sources), missing: found.missing, unreadable,
    corruptDecisions: load.corrupt, approvedTotal: found.sources.length + found.missing.length,
  };
}

/** Approved pairs only; a pair whose AI image is gone is reported, not listed. */
function splitApproved(pairs: ReturnType<typeof pairEntries>, byId: Map<string, { decision: string } | undefined>): { sources: SvgSource[]; missing: string[] } {
  const sources: SvgSource[] = [];
  const missing: string[] = [];
  for (const pair of pairs) {
    if (byId.get(pair.pairId)?.decision !== "approved") continue;
    if (attentionInfo(pair) !== null) missing.push(pair.base);
    else sources.push(sourceOf(pair));
  }
  return { sources, missing };
}

/** The AI side of an approved pair, as a stable source identity. */
function sourceOf(pair: { ai: { relPath: string; size: number; mtime: number } | null; pairId: string }): SvgSource {
  const ai = pair.ai;
  return toSource(ai?.relPath ?? "", ai?.size ?? 0, ai?.mtime ?? 0, pair.pairId);
}

function toSource(relPath: string, size: number, mtime: number, id: string): SvgSource {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  return {
    id,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    relPath,
    dirPath: relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "",
    fingerprint: `${size}:${mtime}`,
  };
}

/** Path order, so a rescan always yields the same list (prompt §2). */
function sortSources(sources: SvgSource[]): SvgSource[] {
  return [...sources].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
}

/** The batch view of a source: stable identity beside the manifest name. */
export function toBatchSource(s: SvgSource): BatchSource {
  return { sourceId: s.id, name: s.stem, relPath: s.relPath, fingerprint: s.fingerprint };
}

/** The stable id a source keeps even if its folder is renamed away. */
export function sourceIdOf(dirPath: string, stem: string): string {
  return pairId(dirPath, stem, "");
}
