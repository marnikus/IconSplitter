// ScanThumb.tsx — thumbnail for Batch row, with cache

import { useCallback, useEffect, useState } from "react";

export function useThumbCache(getUrl: (relPath: string) => Promise<string>) {
  const [cache] = useState(() => new Map<string, string>());
  return useCallback(
    (relPath: string) => {
      const hit = cache.get(relPath);
      if (hit) return Promise.resolve(hit);
      return getUrl(relPath).then((u) => {
        cache.set(relPath, u);
        return u;
      });
    },
    [cache, getUrl],
  );
}

export default function ScanThumb({ relPath, thumbFor, thumb }: { relPath: string; thumbFor: (r: string) => Promise<string>; thumb: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void thumbFor(relPath)
      .then((u) => alive && setSrc(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [relPath, thumbFor]);
  const size = Math.max(48, Math.min(200, thumb));
  return src ? (
    <img src={src} alt="" className="rounded-md bg-white object-contain" style={{ height: size, width: size }} />
  ) : (
    <div className="animate-pulse rounded-md bg-white/10" style={{ height: size, width: size }} />
  );
}
