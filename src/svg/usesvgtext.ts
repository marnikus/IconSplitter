// usesvgtext.ts — reads one relative SVG file out of the picked root for its
// row's preview and the editor modal, with per-path revision subscriptions and
// per-DirHandleLike text caching so opening the editor on an already-loaded SVG
// needs zero disk reads and bumping 1 file wakes only listeners of that file.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import { readSvgText } from "./svgfiles";

const revisions = new Map<string, number>();
const listenersByPath = new Map<string, Set<() => void>>();

const TEXT_CACHE_MAX = 512;
const exactByRoot = new WeakMap<DirHandleLike, Map<string, string | null>>();
const latestByRoot = new WeakMap<DirHandleLike, Map<string, string | null>>();

function getBucket(store: WeakMap<DirHandleLike, Map<string, string | null>>, root: DirHandleLike): Map<string, string | null> {
  let map = store.get(root);
  if (map === undefined) {
    map = new Map();
    store.set(root, map);
  }
  return map;
}

function lruGet(map: Map<string, string | null>, key: string): string | null | undefined {
  if (!map.has(key)) return undefined;
  const val = map.get(key)!;
  map.delete(key);
  map.set(key, val);
  return val;
}

function lruSet(map: Map<string, string | null>, key: string, val: string | null): void {
  if (map.has(key)) map.delete(key);
  else if (map.size >= TEXT_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
}

/** Tells only the preview(s) showing `relPath` to read the file again. */
export function bumpSvgFile(relPath: string): void {
  revisions.set(relPath, (revisions.get(relPath) ?? 0) + 1);
  const subs = listenersByPath.get(relPath);
  if (subs !== undefined) subs.forEach((fn) => fn());
}

function usePathRevision(relPath: string): number {
  return useSyncExternalStore(
    (onChange) => {
      if (relPath === "") return () => {};
      let subs = listenersByPath.get(relPath);
      if (subs === undefined) {
        subs = new Set();
        listenersByPath.set(relPath, subs);
      }
      subs.add(onChange);
      return () => {
        subs!.delete(onChange);
        if (subs!.size === 0) listenersByPath.delete(relPath);
      };
    },
    () => (relPath === "" ? 0 : revisions.get(relPath) ?? 0),
  );
}

function readCachedExact(root: DirHandleLike | null, token: number, relPath: string, rev: number): string | null | undefined {
  if (root === null || relPath === "") return null;
  return lruGet(getBucket(exactByRoot, root), `${token}\0${relPath}\0${rev}`);
}

function readCachedFallback(root: DirHandleLike | null, token: number, relPath: string, rev: number): string | null {
  const exact = readCachedExact(root, token, relPath, rev);
  if (exact !== undefined) return exact;
  return root === null ? null : lruGet(getBucket(latestByRoot, root), `${token}\0${relPath}`) ?? null;
}

function useLoadMissingSvg(
  rootRef: { current: DirHandleLike | null },
  key: { token: number; relPath: string; rev: number },
  onLoaded: (exactKey: string, text: string | null) => void,
): void {
  useEffect(() => {
    const r = rootRef.current;
    if (r === null || key.relPath === "") return;
    const exactKey = `${key.token}\0${key.relPath}\0${key.rev}`;
    if (lruGet(getBucket(exactByRoot, r), exactKey) !== undefined) return;
    let cancelled = false;
    void readSvgText(r, key.relPath).then((next) => {
      lruSet(getBucket(exactByRoot, r), exactKey, next);
      lruSet(getBucket(latestByRoot, r), `${key.token}\0${key.relPath}`, next);
      if (!cancelled) onLoaded(exactKey, next);
    }, () => {
      lruSet(getBucket(exactByRoot, r), exactKey, null);
      lruSet(getBucket(latestByRoot, r), `${key.token}\0${key.relPath}`, null);
      if (!cancelled) onLoaded(exactKey, null);
    });
    return () => { cancelled = true; };
  }, [rootRef, key.token, key.relPath, key.rev, onLoaded]);
}

export function useSvgText(
  rootRef: { current: DirHandleLike | null },
  rootToken: number,
  relPath: string,
): string | null {
  const rev = usePathRevision(relPath);
  const root = rootRef.current;
  const exactKey = `${rootToken}\0${relPath}\0${rev}`;
  const cachedExact = readCachedExact(root, rootToken, relPath, rev);
  const [state, setState] = useState<{ key: string; text: string | null }>(() => ({
    key: exactKey,
    text: readCachedFallback(root, rootToken, relPath, rev),
  }));
  const onLoaded = useMemo(() => (k: string, text: string | null) => setState({ key: k, text }), []);
  useLoadMissingSvg(rootRef, { token: rootToken, relPath, rev }, onLoaded);
  if (relPath === "") return null;
  if (cachedExact !== undefined) return cachedExact;
  return state.key === exactKey ? state.text : readCachedFallback(root, rootToken, relPath, rev);
}
