// pairrebase.ts — the same pair file, read from a root that did not write it
// (I-49). A pair file lives beside its images, so the FILE's own directory is
// the truth about where the pair is now; the paths inside it were relative to
// whatever root was picked when it was written. Rebasing re-points both faces at
// that directory (their file NAMES never change) and recomputes the id exactly
// as a scan of this root does, so a decision follows the folder between roots.
// Pure: paths in, paths out (RULE 1/3).

import { pairId } from "./pairing";
import type { PairIdentity, PairMeta, PairSide } from "./pairmeta";

/** The pair as THIS root sees it: the file's directory and the names it holds. */
export function rebaseMeta(meta: PairMeta, dirPath: string): PairMeta {
  const identity: PairIdentity = {
    id: pairId(dirPath, meta.base, meta.suffix), base: meta.base, suffix: meta.suffix, dirPath,
  };
  return {
    ...meta, ...identity,
    ai: rebaseSide(meta.ai, dirPath),
    source: meta.source === null ? null : rebaseSide(meta.source, dirPath),
  };
}

/** One face, re-pointed at `dirPath`: a face with no file keeps no path either. */
function rebaseSide(side: PairSide, dirPath: string): PairSide {
  const name = side.name === "" ? baseName(side.relPath) : side.name;
  if (side.relPath === "" || name === "") return { ...side, name };
  return { ...side, name, relPath: dirPath === "" ? name : `${dirPath}/${name}` };
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}
