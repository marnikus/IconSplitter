// scan.ts — the Selection tab's recursive scan (spec §1).
// Owns: reading the split root through the shared fs adapter and turning the
// tree into pairs. Generated split output is ignored, exactly like the batch
// scan, so a review never lists its own exports.

import { readDirTree, type DirHandleLike } from "../lib/fs";
import { buildPairs, type ReviewPair } from "../lib/review";
import { walkTree } from "../lib/scan";

const REVIEW_IGNORE = ["_split_output"];

export async function scanPairs(root: DirHandleLike): Promise<ReviewPair[]> {
  const tree = await readDirTree(root, REVIEW_IGNORE);
  return buildPairs(walkTree(tree, REVIEW_IGNORE));
}
