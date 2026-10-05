// splitscope.ts — which files the review/generation lists may use (I-38).
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece; the main folder keeps the unsplit sheets, which are the batch's
// input. When the picked tree holds such a folder, that folder is the reviewable
// set — the main folder's unsplit files are not. Pure: names and paths only.

import { isRunStamp, isSplitDirName } from "./batchlayout";
import type { ReviewPair } from "./pairing";
import type { TreeNode } from "./scan";

export { isSplitDirName }; // the layout's names live in lib/batchlayout

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
 * What the picked folder makes reviewable (I-38/I-47). Decided from the names —
 * the tree's directories and the root's own name — so a repeated scan of the
 * same folder always decides the same way.
 */
export interface ScopeRule {
  /** The reviewable set is a split output: the folder is one, or holds one. */
  split: boolean;
  /**
   * The output folder lies strictly BELOW the picked root, so the root has a
   * main folder whose pairs are out of scope. False when the picked folder is
   * the output folder itself (or one run inside it): then everything found is
   * the set, and nothing is "in the main folder".
   */
  hideOutside: boolean;
}

export function scopeOf(names: readonly string[], rootName: string): ScopeRule {
  const outputBelow = names.some(isSplitDirName);
  // A run stamp anywhere — the root's own name or a directory below it — is the
  // evidence that this picked set IS a batch output (I-50), so the run folder,
  // the output folder and its month all name their set the same way.
  const runInside = [rootName, ...names].some(isRunStamp);
  return { split: outputBelow || runInside, hideOutside: outputBelow };
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
export function splitPairs(pairs: readonly ReviewPair[], rule: ScopeRule): ScopedPairs {
  if (!rule.hideOutside) return { pairs: [...pairs], outside: [] };
  return {
    pairs: pairs.filter(pairInSplitScope),
    outside: pairs.filter((p) => !pairInSplitScope(p)),
  };
}

/** The scope as the toolbars state it (I-40) — one wording for both tabs. */
export function scopeText(scope: ScanScope): string {
  if (!scope.split) return "Scope: whole folder — no split output found";
  const hidden = scope.outside === 0 ? "" : ` · ${scope.outside} pair(s) in the main folder not listed`;
  return `Scope: split output only${hidden}`;
}
