// useCompare.ts — loads both sides of the selected pair for the comparison
// window and releases their object URLs when the selection or root changes.

import { useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewItem } from "../lib/reviewmerge";
import type { SideView } from "./CompareView";
import { readSide, releaseSide } from "./detail";

export interface CompareSides {
  source: SideView | null;
  ai: SideView | null;
}

export interface CompareDetail {
  sides: CompareSides;
  busy: boolean;
}

const EMPTY: CompareSides = { source: null, ai: null };

export function useCompare(root: DirHandleLike | null, item: ReviewItem | null): CompareDetail {
  const [sides, setSides] = useState<CompareSides>(EMPTY);
  const [busy, setBusy] = useState(false);
  const shown = useRef<CompareSides>(EMPTY);
  const sourcePath = item?.source?.relPath ?? null;
  const aiPath = item?.ai?.relPath ?? null;
  useEffect(() => () => { releaseSide(shown.current.source); releaseSide(shown.current.ai); }, []);
  useEffect(() => {
    if (!root || (!sourcePath && !aiPath)) return show(EMPTY, setSides, shown);
    let alive = true;
    setBusy(true);
    void loadBoth(root, sourcePath, aiPath).then((loaded) => {
      if (!alive) return releaseBoth(loaded);
      show(loaded, setSides, shown);
      setBusy(false);
    });
    return () => { alive = false; };
  }, [root, sourcePath, aiPath]);
  return { sides, busy };
}

async function loadBoth(root: DirHandleLike, sourcePath: string | null, aiPath: string | null): Promise<CompareSides> {
  const [source, ai] = await Promise.all([
    sourcePath ? readSide(root, sourcePath) : Promise.resolve(null),
    aiPath ? readSide(root, aiPath) : Promise.resolve(null),
  ]);
  return { source, ai };
}

/** Swaps in freshly loaded sides and releases the ones they replace. */
function show(next: CompareSides, set: (s: CompareSides) => void, shown: { current: CompareSides }): void {
  releaseSide(shown.current.source);
  releaseSide(shown.current.ai);
  shown.current = next;
  set(next);
}

function releaseBoth(sides: CompareSides): void {
  releaseSide(sides.source);
  releaseSide(sides.ai);
}
