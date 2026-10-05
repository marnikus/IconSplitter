// keystore.ts — local storage for the Requesty API key (prompt §7, RULE 20).
// Owns: writing, reading and clearing the key in the browser's IndexedDB
// secret store. The key is never written to localStorage, to a preset, to a
// report, or to the repository; the UI only ever shows maskKey(key) and every
// error/export goes through redact(). When IndexedDB is unavailable the key
// lives in memory for the session only and the UI says so honestly.

import { idbDelete, idbGet, idbPut } from "../batch/store";
import { forgetSecret, watchSecret } from "../log/secrets";

const STORE = "secrets";
const KEY = "requesty-api-key";

/** Session-only fallback for browsers without IndexedDB. */
let memory: string | null = null;

/**
 * Writes the key. Returns false when only the in-memory copy could be kept
 * (private mode, a blocked upgrade, a refused write) — the caller must say so
 * honestly instead of claiming the key was stored on this device. A throw here
 * would leave the save button looking dead, which is exactly how the bug this
 * guards against presented.
 */
export async function saveApiKey(key: string): Promise<boolean> {
  // Registered so the log masks it even with no recognisable shape. A key that
  // is REPLACED stays registered for the session — it may still be live
  // elsewhere; saving an empty string or clearing forgets the current one.
  if (key.trim() === "") {
    if (memory !== null) forgetSecret(memory);
  } else {
    watchSecret(key.trim());
  }
  memory = key.trim() === "" ? null : key.trim();
  try {
    return await idbPut(STORE, KEY, { key: memory });
  } catch {
    return false;
  }
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const stored = await idbGet<{ key?: unknown }>(STORE, KEY);
    const key = stored?.key;
    if (typeof key === "string" && key.trim() !== "") {
      watchSecret(key); // a new session starts with an empty registry
      return key;
    }
  } catch {
    // Unreadable storage is not a lost key: fall through to the memory copy.
  }
  if (memory !== null) watchSecret(memory);
  return memory;
}

export async function clearApiKey(): Promise<void> {
  if (memory !== null) forgetSecret(memory);
  memory = null;
  try {
    await idbDelete(STORE, KEY);
  } catch {
    // Nothing to do: the key is already out of memory.
  }
}

/** True when a key is available for a request right now. */
export async function hasApiKey(): Promise<boolean> {
  return (await loadApiKey()) !== null;
}
