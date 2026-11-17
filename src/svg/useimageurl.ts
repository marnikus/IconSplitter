// useimageurl.ts — the object URL of a row's raster image (2026-11-06, shared
// by the row's AI-source thumbnail and the edit mode's AI source panel), read
// through the Selection thumbnail cache.

import { useEffect, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { useSideThumbs } from "../selection/thumbs";

export function useImageUrl(rootRef: { current: DirHandleLike | null }, relPath: string): string | null {
  const thumbFor = useSideThumbs(rootRef);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (relPath === "") { setUrl(null); return () => { live = false; }; }
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor]);
  return url;
}
