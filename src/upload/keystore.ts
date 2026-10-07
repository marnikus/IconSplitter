// keystore.ts — local storage for the Gemini API key (design §2.8/§2.4,
// RULE 20). Owns: writing, reading and clearing the key in the browser's
// IndexedDB secret store under its own id (`gemini-api-key` — the Requesty key
// keeps its own slot). The key is never written to localStorage, to a settings
// payload, to a report, or to the repository; the UI only ever shows
// maskKey(key) and every error/log goes through redact(). When IndexedDB is
// unavailable the key lives in memory for the session only and the UI says so
// honestly. Same opt-in pattern as Generate SVG → Requesty: the image bytes
// leave the browser only inside the one request the user confirms.

import { idbDelete, idbGet, idbPut } from "../batch/store";

const STORE = "secrets";
const KEY = "gemini-api-key";

/** Session-only fallback for browsers without IndexedDB. */
let memory: string | null = null;

/**
 * Writes the key. Returns false when only the in-memory copy could be kept
 * (private mode, a blocked upgrade, a refused write) — the caller must say so
 * honestly instead of claiming the key was stored on this device.
 */
export async function saveGeminiKey(key: string): Promise<boolean> {
  memory = key.trim() === "" ? null : key.trim();
  const persisted = await putKey(memory);
  return persisted;
}

/** A refused IndexedDB write is not a lost key: the session copy still works. */
async function putKey(key: string | null): Promise<boolean> {
  try {
    return await idbPut(STORE, KEY, { key });
  } catch {
    return false;
  }
}

export async function loadGeminiKey(): Promise<string | null> {
  try {
    const stored = await idbGet<{ key?: unknown }>(STORE, KEY);
    const key = stored?.key;
    if (typeof key === "string" && key.trim() !== "") return key;
  } catch {
    // Unreadable storage is not a lost key: fall through to the memory copy.
  }
  return memory;
}

export async function clearGeminiKey(): Promise<void> {
  memory = null;
  try {
    await idbDelete(STORE, KEY);
  } catch {
    // Nothing to do: the key is already out of memory.
  }
}

/** True when a key is available for a request right now. */
export async function hasGeminiKey(): Promise<boolean> {
  return (await loadGeminiKey()) !== null;
}
