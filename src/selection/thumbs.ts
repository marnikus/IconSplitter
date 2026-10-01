// thumbs.ts — object-URL thumbnail resolver for Selection rows/panes.
// Caches URLs per relPath for the session (same idiom as batch ScanTable).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewPair } from "../lib/pairing";
import { resolveFile } from "./handles";

export type ThumbFor = (p: ReviewPair) => Promise<string>;

export function useThumbFor(rootRef: { current: DirHandleLike | null }): ThumbFor {
  const cache = useRef(new Map<string, string>());
  return useCallback(async (p: ReviewPair) => {
    const side = p.source ?? p.ai;
    if (!side) throw new Error("pair has no files");
    const hit = cache.current.get(side.relPath);
    if (hit) return hit;
    const root = rootRef.current;
    const fh = root ? await resolveFile(root, side.relPath) : null;
    if (!fh) throw new Error("file gone");
    const url = URL.createObjectURL(await fh.getFile());
    cache.current.set(side.relPath, url);
    return url;
  }, [rootRef]);
}

/** One resolver for a single explicit side (comparison panes). */
export function sideUrl(rootRef: { current: DirHandleLike | null }, relPath: string): Promise<string> {
  return (async () => {
    const root = rootRef.current;
    const fh = root ? await resolveFile(root, relPath) : null;
    if (!fh) throw new Error("file gone");
    return URL.createObjectURL(await fh.getFile());
  })();
}

export type SideThumbFor = (relPath: string) => Promise<string>;

/** Cached per-side resolver — V2 rows show BOTH sides of a pair (spec V2 §3). */
export function useSideThumbs(rootRef: { current: DirHandleLike | null }): SideThumbFor {
  const cache = useRef(new Map<string, string>());
  return useCallback(async (relPath: string) => {
    const hit = cache.current.get(relPath);
    if (hit) return hit;
    const url = await sideUrl(rootRef, relPath);
    cache.current.set(relPath, url);
    return url;
  }, [rootRef]);
}
