// metacache.ts — the accepted-metadata cache (CP-15 / merge-report §9): an
// answer the model already produced for one source fingerprint, so a crash, a
// reload or a settings change can never bill the same icon twice. Keyed by the
// sha256 of the SOURCE SVG bytes, so changed artwork misses the cache by
// construction and can never be served a stale answer.
//
// Tolerant on read (RULE 13: a corrupt payload costs one ignored load) and
// bounded in size (the cache must not grow without limit on a 400-icon folder).

import { isRecord } from "../lib/isrecord";
import { validateMetadata, type IconMetadata } from "../lib/upload/meta";
import { readKey, writeKey } from "../state/safestorage";
import { EMPTY_META, type UploadMetaState } from "./types";

export const META_CACHE_KEY = "iconSplitter.upload.meta.v1";
export const META_CACHE_VERSION = 1;
/** Oldest entries are dropped beyond this — a folder of 400 icons fits once. */
export const META_CACHE_LIMIT = 512;

/** How far the paid answer got: the model replied, and the user had their say. */
export interface CachedMeta {
  state: "generated" | "accepted";
  meta: IconMetadata;
}

export type MetaCache = Record<string, CachedMeta>;

/** Stored payload → cache; every entry is shape-checked, junk is dropped. */
export function parseMetaCache(raw: unknown): MetaCache {
  if (!isRecord(raw) || raw.v !== META_CACHE_VERSION) return {};
  if (!isRecord(raw.cache)) return {};
  const out: MetaCache = {};
  for (const [hash, value] of Object.entries(raw.cache)) {
    const entry = entryOf(value);
    if (entry !== null) out[hash] = entry;
  }
  return out;
}

function entryOf(value: unknown): CachedMeta | null {
  if (!isRecord(value)) return null;
  const state = value.state === "accepted" ? "accepted" : value.state === "generated" ? "generated" : null;
  const meta = metadataOf(value.meta);
  return state === null || meta === null ? null : { state, meta };
}

function metadataOf(value: unknown): IconMetadata | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== "string" || typeof value.description !== "string") return null;
  if (!Array.isArray(value.tags) || !value.tags.every((t) => typeof t === "string")) return null;
  return { title: value.title, description: value.description, tags: value.tags };
}

export function loadMetaCache(): MetaCache {
  const text = readKey(META_CACHE_KEY);
  if (!text) return {};
  try {
    return parseMetaCache(JSON.parse(text));
  } catch {
    return {};
  }
}

export function saveMetaCache(cache: MetaCache): MetaCache {
  const bounded = bound(cache);
  writeKey(META_CACHE_KEY, JSON.stringify({ v: META_CACHE_VERSION, cache: bounded }));
  return bounded;
}

/** Beyond the limit the OLDEST entries go first, so a long session stays bounded. */
function bound(cache: MetaCache): MetaCache {
  const keys = Object.keys(cache);
  if (keys.length <= META_CACHE_LIMIT) return cache;
  const next: MetaCache = {};
  for (const key of keys.slice(keys.length - META_CACHE_LIMIT)) next[key] = cache[key];
  return next;
}

/** The entry for one source fingerprint, or null when the artwork moved. */
export function cachedMeta(hash: string | null): CachedMeta | null {
  return hash === null ? null : (loadMetaCache()[hash] ?? null);
}

/**
 * Remembers one answer under its source fingerprint and returns the new cache.
 * Beyond the limit the oldest entries go first, so a long session stays bounded.
 */
export function rememberMeta(hash: string, entry: CachedMeta): MetaCache {
  if (hash === "") return loadMetaCache();
  const cache = loadMetaCache();
  return saveMetaCache({ ...cache, [hash]: entry });
}

/** A restored answer never skips review: `accepted` was accepted, `generated` is not. */
export function restoredMeta(entry: CachedMeta | null): UploadMetaState {
  if (entry === null) return EMPTY_META;
  const validation = validateMetadata(entry.meta);
  const state = validation.ok ? entry.state : "invalid";
  return {
    ...EMPTY_META,
    state,
    metadata: entry.meta,
    validation,
    detail: validation.ok ? "" : "the remembered answer no longer passes the policy — fix it or generate again",
  };
}

/** Would asking the provider again be the only way to get an answer? (CP-10) */
export function needsModelCall(meta: UploadMetaState): boolean {
  return meta.state !== "accepted" && meta.state !== "generated";
}
