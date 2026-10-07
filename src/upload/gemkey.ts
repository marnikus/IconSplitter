// gemkey.ts — local storage for the Gemini API key (design §7, RULE 20).
// Owns: writing, reading and clearing the key in the browser's IndexedDB
// secret store (key id `gemini-api-key`). The key is never written to
// localStorage, to a preset, to a report, or to the repository; the UI only
// ever shows the mask, and every log line goes through the shared redaction
// rule. When IndexedDB is unavailable the key lives in memory for the session
// only and the UI says so honestly. Mirrors svg/keystore (the Requesty key) —
// same store, different key id, so one feature's key never shadows the other's.

import { log } from "../log/logstore";
import { maskKey } from "../lib/svgsecret";
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
  logKeyChange(memory, persisted);
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

/** The log only ever sees the mask and whether the write persisted (RULE 20). */
function logKeyChange(key: string | null, persisted: boolean): void {
  if (key === null) {
    log({ feature: "upload", action: "key-cleared", detail: "the Gemini API key was cleared from this device" });
    return;
  }
  const mask = maskKey(key);
  log({ feature: "upload", action: "key-saved", detail: `stored ${mask}`, data: { keyMask: mask, persisted } });
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
  log({ feature: "upload", action: "key-cleared", detail: "the Gemini API key was cleared from this device" });
}

/** True when a key is available for a request right now. */
export async function hasGeminiKey(): Promise<boolean> {
  return (await loadGeminiKey()) !== null;
}
