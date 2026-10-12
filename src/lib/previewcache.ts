// previewcache.ts — strips by key, under a byte budget, with pinning and revoke
// (design D6). Pure logic: no React, no IO. Every path that drops a strip goes
// through `dropFrame`, so an object URL is revoked exactly once — never twice,
// never zero times (RULE 20). Entries are session-only: nothing here persists (D10).

import { CACHE_BYTES } from "./previewlimits";

export interface PreviewEntry {
  /** `relPath` + settings fingerprint: two settings can never share a frame. */
  key: string;
  /** One PNG per chunk canvas, left to right. */
  blobs: Blob[];
  count: number;
  usedFrac: number;
}

interface Frame extends PreviewEntry {
  urls: string[];
  bytes: number;
  pinned: boolean;
  used: number; // LRU stamp
}

export interface CachedStrip extends PreviewEntry {
  urls: string[];
  bytes: number;
}

export interface PreviewCache {
  get(key: string): CachedStrip | undefined;
  has(key: string): boolean;
  /** `"too-big"` when one strip alone exceeds the budget — it is not cached at all. */
  put(entry: PreviewEntry): "ok" | "too-big";
  pin(key: string, pinned: boolean): void;
  drop(key: string): void;
  clear(): void;
  stats(): { items: number; bytes: number };
}

export interface CacheDeps {
  budget?: number;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

interface CacheState {
  budget: number;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  frames: Map<string, Frame>;
  bytes: number;
  clock: number;
}

export function createPreviewCache(deps: CacheDeps = {}): PreviewCache {
  const st: CacheState = {
    budget: deps.budget ?? CACHE_BYTES,
    createUrl: deps.createUrl ?? ((b) => URL.createObjectURL(b)),
    revokeUrl: deps.revokeUrl ?? ((u) => URL.revokeObjectURL(u)),
    frames: new Map(),
    bytes: 0,
    clock: 0,
  };
  return {
    get: (key) => readFrame(st, key),
    has: (key) => st.frames.has(key),
    put: (entry) => insertFrame(st, entry),
    pin: (key, pinned) => pinFrame(st, key, pinned),
    drop: (key) => dropFrame(st, key),
    clear: () => clearFrames(st),
    stats: () => ({ items: st.frames.size, bytes: st.bytes }),
  };
}

function readFrame(st: CacheState, key: string): CachedStrip | undefined {
  const f = st.frames.get(key);
  if (!f) return undefined;
  f.used = ++st.clock; // reading is using, and using is what LRU evicts last
  return { key, blobs: f.blobs, urls: f.urls, count: f.count, usedFrac: f.usedFrac, bytes: f.bytes };
}

function insertFrame(st: CacheState, entry: PreviewEntry): "ok" | "too-big" {
  const bytes = entry.blobs.reduce((s, b) => s + b.size, 0);
  if (bytes > st.budget) return "too-big"; // honest refusal (RULE 4), never a thrash
  const pinned = st.frames.get(entry.key)?.pinned ?? false; // read before its own drop
  dropFrame(st, entry.key); // same key, new settings: the old URLs go first
  evictFor(st, bytes);
  st.frames.set(entry.key, { ...entry, urls: entry.blobs.map(st.createUrl), bytes, pinned, used: ++st.clock });
  st.bytes += bytes;
  return "ok";
}

/** LRU with visible rows pinned: unpinned victims first, oldest first. */
function evictFor(st: CacheState, need: number): void {
  while (st.bytes + need > st.budget) {
    const victim = oldestKey(st, false) ?? oldestKey(st, true);
    if (!victim) return; // nothing left to drop: the new strip still arrives
    dropFrame(st, victim);
  }
}

function oldestKey(st: CacheState, pinned: boolean): string | undefined {
  let best: Frame | undefined;
  for (const f of st.frames.values()) {
    if (f.pinned !== pinned) continue;
    if (!best || f.used < best.used) best = f;
  }
  return best?.key;
}

function pinFrame(st: CacheState, key: string, pinned: boolean): void {
  const f = st.frames.get(key);
  if (f) f.pinned = pinned;
}

/** The one way a strip ever leaves the cache — and the one place a URL is revoked. */
function dropFrame(st: CacheState, key: string): void {
  const f = st.frames.get(key);
  if (!f) return;
  st.frames.delete(key);
  st.bytes -= f.bytes;
  for (const u of f.urls) st.revokeUrl(u);
}

function clearFrames(st: CacheState): void {
  for (const key of [...st.frames.keys()]) dropFrame(st, key);
}
