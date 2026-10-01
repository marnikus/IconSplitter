// thumbs.ts — object-URL resolver for Selection rows/panes (RULE 20).
// Caches one URL per relPath for the session so dual thumbnails per row
// resolve each side independently (same idiom as batch ScanTable).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { resolveFile } from "./handles";

export type UrlFor = (relPath: string) => Promise<string>;

/** Cached resolver shared by every list row (both sides). */
export function useUrlFor(rootRef: { current: DirHandleLike | null }): UrlFor {
  const cache = useRef(new Map<string, string>());
  return useCallback(async (relPath: string) => {
    const hit = cache.current.get(relPath);
    if (hit) return hit;
    const root = rootRef.current;
    const fh = root ? await resolveFile(root, relPath) : null;
    if (!fh) throw new Error("file gone");
    const url = URL.createObjectURL(await fh.getFile());
    cache.current.set(relPath, url);
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
