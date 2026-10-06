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
const SECRET_STORE = "secrets";

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

/** Persists picked directory handles for a preset (best effort). */
export async function saveHandles(presetName: string, handles: StoredHandles): Promise<void> {
  await idbPut(DB_STORE, presetName, handles);
}

/** Loads persisted handles; null when nothing stored or IDB unavailable. */
export async function loadHandles(presetName: string): Promise<StoredHandles | null> {
  return (await idbGet<StoredHandles>(DB_STORE, presetName)) ?? null;
}

/**
 * Version 2 added the `secrets` object store (RULE 20). Anyone who used the
 * app before it shipped already has a version-1 database holding only
 * `handles`, and opening it at the same version never runs `onupgradeneeded` —
 * so every key write would fail. Bumping the version is what creates the store
 * for them.
 */
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        if (!db.objectStoreNames.contains(SECRET_STORE)) db.createObjectStore(SECRET_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Another tab still holds version 1 open, so the upgrade has to wait for
      // it. Reporting "no storage" keeps the caller moving (memory fallback)
      // instead of never settling at all.
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, use: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = use(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generic IndexedDB put/get used by the local secret store (RULE 20: the API
 * key never touches localStorage, a preset or the repository). Both report
 * whether the write really happened, so a caller can be honest about it.
 */
export async function idbPut(store: string, key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  await tx(db, store, "readwrite", (s) => s.put(value, key));
  return true;
}

export async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return tx<T>(db, store, "readonly", (s) => s.get(key));
}

export async function idbDelete(store: string, key: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  await tx(db, store, "readwrite", (s) => s.delete(key));
  return true;
}
