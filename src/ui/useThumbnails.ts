// useThumbnails.ts — shared thumbnail cache for the batch table and the review
// list. Owns: lazy loading, failure marks, and revocation of the object URLs
// when the cache is cleared or the component unmounts (RULE 20).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface Thumbs {
  urlFor: (relPath: string) => string | null;
  errorFor: (relPath: string) => boolean;
  request: (relPath: string) => void;
  clear: () => void;
}

interface Cache {
  urls: Map<string, string>;
  failed: Set<string>;
  loading: Set<string>;
}

export function useThumbnails(resolve: (relPath: string) => Promise<string>): Thumbs {
  const cache = useRef<Cache>(emptyCache());
  const [, bump] = useState(0);
  const resolver = useRef(resolve);
  resolver.current = resolve;
  useEffect(() => () => release(cache.current), []);
  const request = useCallback((relPath: string) => {
    void load(cache.current, relPath, resolver.current, () => bump((n) => n + 1));
  }, []);
  const clear = useCallback(() => {
    release(cache.current);
    cache.current = emptyCache();
    bump((n) => n + 1);
  }, []);
  const urlFor = useCallback((relPath: string) => cache.current.urls.get(relPath) ?? null, []);
  const errorFor = useCallback((relPath: string) => cache.current.failed.has(relPath), []);
  return useMemo(() => ({ urlFor, errorFor, request, clear }), [urlFor, errorFor, request, clear]);
}

function emptyCache(): Cache {
  return { urls: new Map(), failed: new Set(), loading: new Set() };
}

/** One attempt per path: a failed thumbnail stays failed until clear(). */
async function load(cache: Cache, relPath: string, resolve: (p: string) => Promise<string>, done: () => void): Promise<void> {
  if (cache.urls.has(relPath) || cache.failed.has(relPath) || cache.loading.has(relPath)) return;
  cache.loading.add(relPath);
  try {
    cache.urls.set(relPath, await resolve(relPath));
  } catch {
    cache.failed.add(relPath);
  } finally {
    cache.loading.delete(relPath);
    done();
  }
}

function release(cache: Cache): void {
  for (const url of cache.urls.values()) URL.revokeObjectURL(url);
  cache.urls.clear();
}
