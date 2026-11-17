// sourcepairs.ts — the pair files an Upload scan finds (2026-11-06), so an
// export whose source item is no longer approved in Generate SVG is hidden and
// Remove knows which pair file to decline. Reads through the shared parallel,
// session-cached loader, so an unchanged folder costs no extra reads.

import type { DirHandleLike } from "../lib/fs";
import type { FileEntry } from "../lib/scan";
import { sourcePairKey, type SourcePair } from "../lib/stockupload/discovery";
import { loadPairFiles } from "../selection/pairstore";

/** Every readable pair file of the walk, by its folder/base/suffix (first in path order wins). */
export async function sourcePairsOf(root: DirHandleLike, entries: readonly FileEntry[]): Promise<Map<string, SourcePair>> {
  const out = new Map<string, SourcePair>();
  for (const [metaPath, read] of await loadPairFiles(root, entries)) {
    const meta = read.meta;
    if (meta === null || read.corrupt) continue;
    const key = sourcePairKey(meta.dirPath, meta.base, meta.suffix);
    if (!out.has(key)) out.set(key, { id: meta.id, metaPath, approved: meta.review === "approved" });
  }
  return out;
}
