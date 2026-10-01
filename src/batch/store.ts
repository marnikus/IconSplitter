// store.ts — persistence for the batch feature (spec §3; RULE 13).
// Owns: preset list + last-used name in localStorage, and directory handles
// in IndexedDB (structured-cloneable, survive restarts, permission re-requested
// on use). JSON is validated on read; corrupt payloads fall back to defaults.

import { parsePresetList, serializePresetList, type Preset } from "../lib/presets";
import type { DirHandleLike } from "../lib/fs";

const PRESETS_KEY = "iconSplitter.presets.v1";
const LAST_KEY = "iconSplitter.lastPreset.v1";
const DB_NAME = "iconSplitter";
const DB_STORE = "handles";

export function loadPresets(): Preset[] {
  const text = localStorage.getItem(PRESETS_KEY);
  return text ? parsePresetList(text) : [];
}

export function savePresets(list: Preset[]): void {
  localStorage.setItem(PRESETS_KEY, serializePresetList(list));
}

export function loadLastName(): string | null {
  return localStorage.getItem(LAST_KEY);
}

export function saveLastName(name: string): void {
  localStorage.setItem(LAST_KEY, name);
}

export interface StoredHandles {
  source?: DirHandleLike;
  dest?: DirHandleLike;
}

/** Generic key-value persistence in the app's IndexedDB store (best effort). */
export async function saveStored(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (store) => store.put(value, key));
}

export async function loadStored<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return (await tx<T>(db, "readonly", (store) => store.get(key))) ?? null;
}

/** Persists picked directory handles for a preset (best effort). */
export async function saveHandles(presetName: string, handles: StoredHandles): Promise<void> {
  await saveStored(presetName, handles);
}

/** Loads persisted handles; null when nothing stored or IDB unavailable. */
export async function loadHandles(presetName: string): Promise<StoredHandles | null> {
  return loadStored<StoredHandles>(presetName);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, use: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(DB_STORE, mode);
    const req = use(t.objectStore(DB_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
