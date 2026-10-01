// keystore.ts — local storage for the Requesty API key (prompt §7, RULE 20).
// Owns: writing, reading and clearing the key in the browser's IndexedDB
// secret store. The key is never written to localStorage, to a preset, to a
// report, or to the repository; the UI only ever shows maskKey(key) and every
// error/export goes through redact(). When IndexedDB is unavailable the key
// lives in memory for the session only and the UI says so honestly.

import { idbDelete, idbGet, idbPut } from "../batch/store";

const STORE = "secrets";
const KEY = "requesty-api-key";

/** Session-only fallback for browsers without IndexedDB. */
let memory: string | null = null;

export async function saveApiKey(key: string): Promise<void> {
  memory = key.trim() === "" ? null : key.trim();
  await idbPut(STORE, KEY, { key: memory });
}

export async function loadApiKey(): Promise<string | null> {
  const stored = await idbGet<{ key?: unknown }>(STORE, KEY);
  const key = stored?.key;
  if (typeof key === "string" && key.trim() !== "") return key;
  return memory;
}

export async function clearApiKey(): Promise<void> {
  memory = null;
  await idbDelete(STORE, KEY);
}

/** True when a key is available for a request right now. */
export async function hasApiKey(): Promise<boolean> {
  return (await loadApiKey()) !== null;
}
