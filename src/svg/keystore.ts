// keystore.ts — local storage for the Requesty API key (prompt §7, RULE 20).
// Owns: writing, reading and clearing the key in the browser's IndexedDB
// secret store. The key is never written to localStorage, to a preset, to a
// report, or to the repository; the UI only ever shows maskKey(key) and every
// error/export goes through redact(). When IndexedDB is unavailable the key
// lives in memory for the session only and the UI says so honestly.

import { log } from "../log/logstore";
import { maskKey } from "../lib/svgsecret";
import { idbDelete, idbGet, idbPut } from "../batch/store";

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
  const trimmed = key.trim();
  memory = trimmed === "" ? null : trimmed;
  let stored = false; // a refused/failed write keeps the session copy only
  try {
    stored = await idbPut(STORE, KEY, { key: memory });
  } catch {
    // nothing persisted; the honesty line below says so
  }
  logKeyChange(trimmed, stored);
  return stored;
}

/** The log only ever sees the mask and whether the write persisted (RULE 20). */
function logKeyChange(key: string, stored: boolean): void {
  if (key === "") {
    log({ feature: "svg", action: "key-cleared", detail: "the API key was cleared from this device" });
    return;
  }
  const mask = maskKey(key);
  log({
    feature: "svg", action: "key-saved",
    detail: `API key stored as ${mask}${stored ? " on this device" : " for this session only — browser storage refused it"}`,
    data: { keyMask: mask, persisted: stored },
  });
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const stored = await idbGet<{ key?: unknown }>(STORE, KEY);
    const key = stored?.key;
    if (typeof key === "string" && key.trim() !== "") return key;
  } catch {
    // Unreadable storage is not a lost key: fall through to the memory copy.
  }
  return memory;
}

export async function clearApiKey(): Promise<void> {
  const hadKey = memory !== null;
  memory = null;
  try {
    await idbDelete(STORE, KEY);
  } catch {
    // Nothing to do: the key is already out of memory.
  }
  if (hadKey) log({ feature: "svg", action: "key-cleared", detail: "the API key was cleared from this device" });
}

/** True when a key is available for a request right now. */
export async function hasApiKey(): Promise<boolean> {
  return (await loadApiKey()) !== null;
}
