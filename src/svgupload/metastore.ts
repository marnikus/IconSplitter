// metastore.ts — where accepted metadata lives between sessions (design §5).
// Same shape as settingsstore: one key, one validated payload, one module-scope
// store, so the panel, the exporter and an undo all read the same object. The
// validation is lib/svgupload/meta's; a broken stored value loads as an empty
// store rather than a crash, and a record keeps the prompt, the model and the
// fingerprint it was produced from — the three things a later scan must compare.

import { parseMetaStore, putRecord, type MetaStore } from "../lib/svgupload/meta";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import { readKey, writeKey } from "../state/safestorage";

export const UPLOAD_META_KEY = "iconSplitter.upload.meta.v1";

export function loadMetaStore(): MetaStore {
  const text = readKey(UPLOAD_META_KEY);
  if (!text) return parseMetaStore(null);
  try {
    return parseMetaStore(JSON.parse(text));
  } catch {
    return parseMetaStore(null);
  }
}

export function saveMetaStore(store: MetaStore): void {
  writeKey(UPLOAD_META_KEY, JSON.stringify(store));
}

// --- the in-memory store the panel binds (React-free on purpose) -------------
let current: MetaStore | null = null;
const listeners = new Set<() => void>();

export function getMetaStore(): MetaStore {
  current ??= loadMetaStore();
  return current;
}

export function setMetaStore(next: MetaStore): void {
  current = next;
  saveMetaStore(next);
  for (const notify of listeners) notify();
}

export function subscribeMetaStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stores one record through the module store (the job steps' only writer). */
export function putRecordOnStore(store: MetaStore, record: MetaRecord): void {
  setMetaStore(putRecord(store, record));
}

/** Test seam: forget the cached value so the next read hits storage again. */
export function resetMetaStoreCache(): void {
  current = null;
}
