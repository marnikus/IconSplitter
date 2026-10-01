// scan.ts — the Selection tab's recursive scan (spec §1; design "Recursive · N
// nested folders"). Owns: reading the split root through the shared fs adapter
// and turning the tree into pairs. Generated split output is ignored, exactly
// like the batch scan, so a review never lists its own exports.

import { readDirTree, type DirHandleLike } from "../lib/fs";
import { buildPairs, type ReviewPair } from "../lib/review";
import { countFolders, walkTree } from "../lib/scan";

const REVIEW_IGNORE = ["_split_output"];

export interface RootScan {
  pairs: ReviewPair[];
  folders: number;
}

export async function scanRoot(root: DirHandleLike): Promise<RootScan> {
  const tree = await readDirTree(root, REVIEW_IGNORE);
  return { pairs: buildPairs(walkTree(tree, REVIEW_IGNORE)), folders: countFolders(tree, REVIEW_IGNORE) };
}

export async function scanPairs(root: DirHandleLike): Promise<ReviewPair[]> {
  return (await scanRoot(root)).pairs;
}
