// sources.ts — approved-source discovery for the Generate SVG tab (prompt §1).
// Owns: the recursive scan of the picked root, keeping ONLY pairs the Selection
// workflow approved, and reporting what could not be used (missing AI image,
// unreadable file, corrupt decision file) instead of dropping it silently.
// Stable pair ids are the file identity — never a row index.

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
  const sources: SvgSource[] = [];
  const missing: string[] = [];
  for (const pair of pairs) {
    const view = byId.get(pair.pairId);
    if (view?.decision !== "approved") continue;
    if (attentionInfo(pair) !== null) {
      missing.push(pair.base);
      continue;
    }
    sources.push(toSource(pair.ai?.relPath ?? "", pair.ai?.size ?? 0, pair.ai?.mtime ?? 0, pair.pairId));
  }
  const unreadable = entries.filter((e) => e.size === 0 && e.name !== "").map((e) => e.relPath);
  return { sources: sortSources(sources), missing, unreadable, corruptDecisions: load.corrupt, approvedTotal: sources.length + missing.length };
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

/** The stable id a source keeps even if its folder is renamed away. */
export function sourceIdOf(dirPath: string, stem: string): string {
  return pairId(dirPath, stem, "");
}
