// keystore.ts — local storage for the Requesty API key (prompt §7, RULE 20).
// Owns: writing, reading and clearing the key in the browser's IndexedDB
// secret store. The key is never written to localStorage, to a preset, to a
// report, or to the repository; the UI only ever shows maskKey(key) and every
// error/export goes through redact(). When IndexedDB is unavailable the key
// lives in memory for the session only and the UI says so honestly.

import type { KeyRead, KeySaveOutcome } from "../lib/keyvault";
import { log } from "../log/logstore";
import { maskKey } from "../lib/svgsecret";
import { createIdbKeyVault } from "../lib/idbvault";

const KEY = "requesty-api-key";

const vault = createIdbKeyVault(KEY);

export type { KeyRead, KeySaveOutcome, KeySource } from "../lib/keyvault";

/**
 * Writes the key. `"device"` means it is stored on this device, `"session"`
 * that only the in-memory copy could be kept (private mode, a blocked upgrade,
 * a refused write) and `"empty"` that the field was blank — which NEVER erases
 * a stored key, because clearing is its own deliberate action. The log only
 * ever sees the mask and the outcome (RULE 20).
 */
export async function saveApiKey(key: string): Promise<KeySaveOutcome> {
  const outcome = await vault.save(key);
  if (outcome !== "empty") logKeyChange(key.trim(), outcome === "device");
  return outcome;
}

/** The log only ever sees the mask and whether the write persisted (RULE 20). */
function logKeyChange(key: string, persisted: boolean): void {
  const mask = maskKey(key);
  log({
    feature: "svg", action: "key-saved", detail: `stored ${mask}`,
    data: { keyMask: mask, persisted },
  });
}

/** The key in hand plus where it came from — never a bare null on a failed read. */
export function readApiKey(): Promise<KeyRead> {
  return vault.read();
}

export async function loadApiKey(): Promise<string | null> {
  return vault.load();
}

export async function clearApiKey(): Promise<void> {
  const had = await vault.has();
  await vault.clear();
  if (had) log({ feature: "svg", action: "key-cleared", detail: "the API key was cleared from this device" });
}

/** True when a key is available for a request right now. */
export async function hasApiKey(): Promise<boolean> {
  return vault.has();
}
