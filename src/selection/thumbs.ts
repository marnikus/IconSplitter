// thumbs.ts — object-URL thumbnail resolver for Selection rows/panes.
// Caches URLs per relPath for the session (same idiom as batch ScanTable).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { resolveFile } from "./handles";

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

// A paste overwrites an image IN PLACE (2026-11-17): the path keeps its meaning
// but not its bytes, so every cached object URL for it is stale. A per-path
// generation says which cached urls still describe the file.
const gens = new Map<string, number>();
const thumbListeners = new Set<() => void>();

/** The file at this path was written over — drop every cached URL of it. */
export function bumpSideThumb(relPath: string): void {
  gens.set(relPath, (gens.get(relPath) ?? 0) + 1);
  for (const fn of [...thumbListeners]) fn();
}

/** Resolvers re-read a bumped path; components re-render to ask again. */
export function subscribeSideThumbs(fn: () => void): () => void {
  thumbListeners.add(fn);
  return () => { thumbListeners.delete(fn); };
}

/** Cached per-side resolver — V2 rows show BOTH sides of a pair (spec V2 §3). */
export function useSideThumbs(rootRef: { current: DirHandleLike | null }): SideThumbFor {
  const cache = useRef(new Map<string, { url: string; gen: number }>());
  return useCallback(async (relPath: string) => {
    const gen = gens.get(relPath) ?? 0;
    const hit = cache.current.get(relPath);
    if (hit !== undefined && hit.gen === gen) return hit.url;
    const url = await sideUrl(rootRef, relPath);
    cache.current.set(relPath, { url, gen: gens.get(relPath) ?? gen });
    return url;
  }, [rootRef]);
}
