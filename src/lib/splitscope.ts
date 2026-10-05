// splitscope.ts — which files the review/generation lists may use (I-38).
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece; the main folder keeps the unsplit sheets, which are the batch's
// input. When the picked tree holds such a folder, that folder is the reviewable
// set — the main folder's unsplit files are not. When the picked folder IS the
// output, the whole picked tree is reviewed (I-45). Pure: names and paths only.

import type { ReviewPair } from "./pairing";
import type { TreeNode } from "./scan";

/**
 * The app's output folder: `_split_output`, and tolerant variants a user may
 * have (`_split_output_v2`, `_my_split_output`). A near-miss without the
 * separator (`_splitoutput`) or in the wrong order (`_output_split`) is not it.
 */
export function isSplitDirName(name: string): boolean {
  return /^_.*split.+output/i.test(name);
}

/** Every directory name in the tree, at any depth (the root itself excluded). */
export function directoryNames(tree: TreeNode): string[] {
  const out: string[] = [];
  for (const child of tree.children ?? []) {
    if (!child.dir) continue;
    out.push(child.name, ...directoryNames(child));
  }
  return out;
}

/**
 * True when the reviewable set is a split output: the tree holds such a folder
 * while the picked folder itself is not one. Picking the output reviews it
 * whole — narrowing then would keep only pairs carrying a split segment, and
 * relative to the picked output no pair carries one (bug-1). Decided from the
 * directories, so a repeated scan of the same tree always decides the same way.
 */
export function scopeOf(names: readonly string[], rootName: string): boolean {
  return !isSplitDirName(rootName) && names.some(isSplitDirName);
}

/** True when a relative path has a split-output folder as one of its segments. */
export function inSplitScope(relPath: string): boolean {
  return relPath.split("/").some(isSplitDirName);
}

/** A pair belongs to the scope when either side lives inside a split output. */
export function pairInSplitScope(pair: ReviewPair): boolean {
  return [pair.source?.relPath, pair.ai?.relPath].some((p) => p !== undefined && p !== null && inSplitScope(p));
}

/** What a scan's scope was, and how many pairs it hid (I-40). */
export interface ScanScope {
  split: boolean;
  outside: number;
}

export interface ScopedPairs {
  /** What the list may show. */
  pairs: ReviewPair[];
  /** Approved pairs the scope hides — reported, never listed (I-38/I-40). */
  outside: ReviewPair[];
}

/** Splits a scan into the reviewable pairs and the ones the scope hides. */
export function splitPairs(pairs: readonly ReviewPair[], scoped: boolean): ScopedPairs {
  if (!scoped) return { pairs: [...pairs], outside: [] };
  return {
    pairs: pairs.filter(pairInSplitScope),
    outside: pairs.filter((p) => !pairInSplitScope(p)),
  };
}

/**
 * The scope as the toolbars state it (I-40) — one wording for both tabs. The
 * root name tells a picked output apart: "no split output found" would lie
 * while the user is looking straight at it (I-45).
 */
export function scopeText(scope: ScanScope, rootName = ""): string {
  if (isSplitDirName(rootName)) return "Scope: this split output";
  if (!scope.split) return "Scope: whole folder — no split output found";
  const hidden = scope.outside === 0 ? "" : ` · ${scope.outside} pair(s) in the main folder not listed`;
  return `Scope: split output only${hidden}`;
}
