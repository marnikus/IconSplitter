// previewPersist.ts — stored split previews for Batch (RULE 13): one IndexedDB
// record per rendered preview, keyed "<rootName>::<relPath>", validated on read.
// A corrupt or foreign record costs one ignored entry, never a broken restore.

import type { Box } from "../lib/detect";
import { idbPut, idbGetAll, idbGetAllKeys, idbDelete, idbClear, PREVIEW_STORE } from "./store";

/** What one rendered preview persists (a `done` entry; errors are not stored). */
export interface StoredPreview {
  relPath: string;
  count: number;
  thumbs: string[];
  boxes: Box[];
  status: "done";
  rootName?: string;
  /** Render/write time (ms epoch) — bumped every time a run REWRITES the record. */
  at?: number;
  /** previewKey the record was rendered under (I-68); records from before it existed have none and are never called stale. */
  key?: string;
}

export function storedKey(rootName: string, relPath: string): string {
  return `${rootName || "default"}::${relPath}`;
}

export function saveStoredPreview(rootName: string, entry: Omit<StoredPreview, "at">): void {
  void idbPut(PREVIEW_STORE, storedKey(rootName, entry.relPath), { ...entry, rootName, at: Date.now() });
}

/** One checked field: a finite non-negative count. */
function isCount(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/** One checked field: every thumb is a string (data URL). */
function isThumbs(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((t) => typeof t === "string");
}

/** One checked field: the optional write stamp is a finite number. */
function isStamp(at: unknown): boolean {
  return at === undefined || (typeof at === "number" && Number.isFinite(at));
}

export function isStoredPreview(v: unknown): v is StoredPreview {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<StoredPreview>;
  return typeof e.relPath === "string" && e.relPath !== "" && isCount(e.count) && isThumbs(e.thumbs)
    && Array.isArray(e.boxes) && e.status === "done" && isStamp(e.at);
}

/** A key matches when it was written for this root (prefix, field, or legacy row). */
function matchesRoot(key: string, entry: StoredPreview, rootName: string): boolean {
  if (key.startsWith(`${rootName}::`)) return true;
  if (entry.rootName === rootName) return true;
  return !key.includes("::") && !entry.rootName;
}

/** Every valid stored preview of one root; a failed read is an empty map. */
export async function loadStoredPreviews(rootName: string): Promise<Map<string, StoredPreview>> {
  try {
    const [keys, vals] = await Promise.all([idbGetAllKeys(PREVIEW_STORE), idbGetAll<unknown>(PREVIEW_STORE)]);
    const out = new Map<string, StoredPreview>();
    for (let i = 0; i < vals.length; i++) {
      const record = vals[i];
      const key = keys[i] ?? "";
      if (!isStoredPreview(record)) continue;
      if (rootName && !matchesRoot(key, record, rootName)) continue;
      out.set(record.relPath, record);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Removes this root's records (all of them when no root name is known). */
export async function clearStoredPreviews(rootName?: string): Promise<void> {
  try {
    if (!rootName) {
      await idbClear(PREVIEW_STORE);
      return;
    }
    const keys = await idbGetAllKeys(PREVIEW_STORE);
    const prefix = `${rootName}::`;
    for (const k of keys) if (k.startsWith(prefix)) await idbDelete(PREVIEW_STORE, k);
  } catch {
    // A failed cleanup keeps the records; the next Clear retries.
  }
}
