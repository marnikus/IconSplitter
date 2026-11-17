// splitscope.ts — which files the review/generation lists may use (I-38).
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece; the main folder keeps the unsplit sheets, which are the batch's
// input. When the picked tree holds such a folder, that folder is the reviewable
// set — the main folder's unsplit files are not. Pure: names and paths only.

import { isRunStamp, isSplitDirName } from "./batchlayout";
import { parseAiName } from "./naming";
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

/** `split_04` -> 4; null for a path that is not inside a split folder. */
const SPLIT_DIR = /^split_(\d+)$/i;

/**
 * The Batch piece number a path's own folder carries. The writer puts one piece
 * per folder (`<dest>/<month>/<run>/<sheet>/split_04/<sheet>_04.png`), so the
 * folder's number and the file's tail number are the same fact. A root that IS a
 * split folder answers for the files directly inside it.
 */
export function splitFolderIndex(relPath: string, rootName: string): number | null {
  const dirs = relPath.split("/").slice(0, -1).filter((d) => d !== "");
  const match = SPLIT_DIR.exec(dirs.length > 0 ? dirs[dirs.length - 1] : rootName);
  return match === null ? null : Number(match[1]);
}

/**
 * True when this AI image is the piece its own split folder was written FOR
 * (`…/split_04/download-icon-23_AI_04.png`). Every other image in a split folder
 * — an unnumbered copy, a registered variant, an older build's `_v2` — is a
 * version, not the batch's first generation, so it is never a result of its own
 * (2026-11-02). False outside Batch folders, where this rule never applies.
 */
export function isSplitPiece(relPath: string, rootName: string): boolean {
  const index = splitFolderIndex(relPath, rootName);
  if (index === null) return false;
  const ai = parseAiName(relPath.split("/").at(-1) ?? "");
  const last = ai?.suffix.split("_").filter((part) => part !== "").at(-1);
  return last !== undefined && Number(last) === index;
}

/** True when this image sits in one of the Batch's own split folders. */
export function inSplitFolder(relPath: string, rootName: string): boolean {
  return splitFolderIndex(relPath, rootName) !== null;
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
