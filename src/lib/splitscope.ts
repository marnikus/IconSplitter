// splitscope.ts — which files the review/generation lists may use (I-38).
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece; the main folder keeps the unsplit sheets, which are the batch's
// input. When the picked tree holds such a folder, that folder is the reviewable
// set — the main folder's unsplit files are not.
//
// The scope is RELATIVE to the picked folder, never a property of the tree
// (reported 2026-10-05: opening `_split_output` itself, or one of its months,
// listed NOTHING while every contained folder was full of pieces). The picked
// folder is the base:
//   * the pick IS a split output          -> `output`       — review all of it
//   * a split output is its DIRECT child  -> `output-child` — review that child,
//     report the main folder's pairs as outside (they are the batch's input)
//   * anything else                       -> `whole`       — review all of it
// A split folder BELOW the pick's first level never scopes: a piece folder may
// carry the same words in its name (`2026-10-01_10-24-31_split_01`), and a name
// is not evidence of where the user opened the tree. Deciding from the walked
// tree keeps a rescan identical every time (I-39). Pure: names and paths only.

import type { ReviewPair } from "./pairing";
import type { TreeNode } from "./scan";

/**
 * The app's output folder: `_split_output`, and tolerant variants a user may
 * have (`_split_output_v2`, `_my_split_output`). A near-miss without the
 * separator (`_splitoutput`) or in the wrong order (`_output_split`) is not it;
 * neither is a piece folder like `split_01` (tested, and relied upon here).
 */
export function isSplitDirName(name: string): boolean {
  return /^_.*split.+output/i.test(name);
}

/** One directory of a walked tree, with its depth below the picked folder. */
export interface TreeDir {
  name: string;
  depth: number;
}

/** Every directory of the tree, in walk order, with its depth (root excluded). */
export function treeDirs(tree: TreeNode, depth = 0): TreeDir[] {
  const out: TreeDir[] = [];
  for (const child of tree.children ?? []) {
    if (!child.dir) continue;
    out.push({ name: child.name, depth }, ...treeDirs(child, depth + 1));
  }
  return out;
}

/** How much of the picked tree is reviewable (I-38). */
export type ScopeLevel = "whole" | "output-child" | "output";

/**
 * The level for a pick: `output` when the picked folder is a split output,
 * `output-child` when one sits directly inside it, `whole` otherwise.
 */
export function scopeLevelOf(dirs: readonly TreeDir[], rootName: string): ScopeLevel {
  if (isSplitDirName(rootName)) return "output";
  if (dirs.some((d) => d.depth === 0 && isSplitDirName(d.name))) return "output-child";
  return "whole";
}

/** True when a relative path has a split-output folder as one of its segments. */
export function inScope(relPath: string, level: ScopeLevel): boolean {
  return level !== "output-child" || relPath.split("/").some(isSplitDirName);
}

/** A pair belongs to the scope when either side lives inside a split output. */
export function pairInScope(pair: ReviewPair, level: ScopeLevel): boolean {
  return [pair.source?.relPath, pair.ai?.relPath].some((p) => p !== undefined && p !== null && inScope(p, level));
}

/** What a scan's scope was, and how many pairs it hid (I-40). */
export interface ScanScope {
  level: ScopeLevel;
  outside: number;
}

export interface ScopedPairs {
  /** What the list may show. */
  pairs: ReviewPair[];
  /** Pairs the scope hides — reported, never listed (I-38/I-40). */
  outside: ReviewPair[];
}

/** Splits a scan into the reviewable pairs and the ones the level hides. */
export function splitPairs(pairs: readonly ReviewPair[], level: ScopeLevel): ScopedPairs {
  if (level !== "output-child") return { pairs: [...pairs], outside: [] };
  return {
    pairs: pairs.filter((p) => pairInScope(p, level)),
    outside: pairs.filter((p) => !pairInScope(p, level)),
  };
}

/** The scope as the toolbars state it (I-40) — one wording for both tabs. */
export function scopeText(scope: ScanScope): string {
  if (scope.level === "whole") return "Scope: whole folder — no split output found";
  if (scope.level === "output") return "Scope: split output — everything under it is listed";
  if (scope.outside === 0) return "Scope: split output only";
  return `Scope: split output only · ${scope.outside} pair(s) in the main folder not listed`;
}
