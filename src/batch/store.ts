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

/**
 * The page's ONE connection. Opening a fresh connection per read and per write
 * leaked handles (every op left one behind) and — worse — those handles blocked
 * any later upgrade of the same database: another tab's version bump, or a
 * delete, waits forever, and while it waits every write here fails. That is how
 * a saved API key could be reported as stored and then be missing at the next
 * boot.
 */
let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Which `indexedDB` the cached connection came from (a polyfill swap invalidates it). */
let dbFrom: unknown = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise === null || dbFrom !== indexedDB) {
    dbFrom = indexedDB;
    dbPromise = connect();
  }
  return dbPromise;
}

function connect(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    // A failed or blocked open is not cached: the next call may well succeed
    // (the other tab may have closed by then).
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(releaseDb());
      return;
    }
    req.onupgradeneeded = () => upgrade(req);
    req.onsuccess = () => {
      adopt(req.result);
      resolve(req.result);
    };
    req.onerror = () => resolve(releaseDb());
    // Another tab still holds an older version open. Reporting "no storage"
    // keeps the caller moving (the session fallback), and the retry in
    // `openDb` means the key is written for real once that tab lets go.
    req.onblocked = () => resolve(releaseDb());
  });
}

/** First open of a database (or of a new version): both stores must exist. */
function upgrade(req: IDBOpenDBRequest): void {
  const db = req.result;
  if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
  if (!db.objectStoreNames.contains(SECRET_STORE)) db.createObjectStore(SECRET_STORE);
}

/** Lets go the moment someone else needs the database, then reopens on demand. */
function adopt(db: IDBDatabase): void {
  db.onversionchange = () => {
    db.close();
    releaseDb();
  };
  db.onclose = () => releaseDb();
}

/** A connection that failed, closed or was taken away is never kept. */
function releaseDb(): null {
  dbPromise = null;
  return null;
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, use: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let t: IDBTransaction;
    try {
      t = db.transaction(store, mode);
    } catch (error) {
      releaseDb(); // a closed or torn connection: reopen on the next call
      reject(error);
      return;
    }
    // A transaction that aborts after its request said "success" must not be
    // reported as a durable write.
    t.onerror = () => reject(t.error ?? new Error("the transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("the transaction was aborted"));
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
