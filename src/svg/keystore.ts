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
  // Registered so the global log masks it even when it has no recognisable shape. A key that is
  // REPLACED stays registered for the session: it may still be a live secret somewhere.
  if (key.trim() === "") forgetKey(); else watchSecret(key);
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
    if (typeof key === "string" && key.trim() !== "") return watched(key);
  } catch {
    // Unreadable storage is not a lost key: fall through to the memory copy.
  }
  return memory === null ? null : watched(memory);
}

/** Registers a key the store just handed out, so the log can never print it. */
function watched(key: string): string {
  watchSecret(key);
  return key;
}

/** The key leaves this device: the log may stop masking it. */
function forgetKey(): void {
  if (memory !== null) forgetSecret(memory);
}

export async function clearApiKey(): Promise<void> {
  forgetKey();
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
