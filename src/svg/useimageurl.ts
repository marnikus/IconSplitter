// useimageurl.ts — the object URL of a row's raster image (2026-11-06, shared
// by the row's AI-source thumbnail and the edit mode's AI source panel), read
// through the Selection thumbnail cache.

import { useEffect, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { subscribeSideThumbs, useSideThumbs } from "../selection/thumbs";

export function useImageUrl(rootRef: { current: DirHandleLike | null }, relPath: string): string | null {
  const thumbFor = useSideThumbs(rootRef);
  const [url, setUrl] = useState<string | null>(null);
  // a paste overwrites the file in place (2026-11-17): ask again after a bump
  const [tick, setTick] = useState(0);
  useEffect(() => (relPath === "" ? undefined : subscribeSideThumbs(() => setTick((t) => t + 1))), [relPath]);
  useEffect(() => {
    let live = true;
    if (relPath === "") return () => { live = false; };
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor, tick]);
  return relPath === "" ? null : url;
}
