// keystore.ts — local storage for the Gemini API key (design §2.8/§2.4,
// RULE 20). A thin wrapper over lib/keyvault: the rules about saving, reading
// and clearing live there once, and this file only names the store (`secrets`),
// the slot (`gemini-api-key` — the Requesty key keeps its own) and the one
// write path into IndexedDB. The key is never written to localStorage, to a
// settings payload, to a report, or to the repository; the UI only ever shows
// maskKey(key) and every error/log goes through redact().

import type { KeyRead, KeySaveOutcome } from "../lib/keyvault";
import { createIdbKeyVault } from "../lib/idbvault";

const KEY = "gemini-api-key";

const vault = createIdbKeyVault(KEY);

export type { KeyRead, KeySaveOutcome, KeySource } from "../lib/keyvault";

/**
 * Writes the key. `"device"` means it is on this device, `"session"` that only
 * the in-memory copy could be kept (private mode, a blocked upgrade, a refused
 * write) and `"empty"` that the field was blank — which NEVER erases a stored
 * key, because clearing is its own deliberate action.
 */
export function saveGeminiKey(key: string): Promise<KeySaveOutcome> {
  return vault.save(key);
}

/** The key in hand plus where it came from — never a bare null on a failed read. */
export function readGeminiKey(): Promise<KeyRead> {
  return vault.read();
}

/** The trimmed key, or null when none is available right now. */
export function loadGeminiKey(): Promise<string | null> {
  return vault.load();
}

export function clearGeminiKey(): Promise<void> {
  return vault.clear();
}

/** True when a key is available for a request right now. */
export function hasGeminiKey(): Promise<boolean> {
  return vault.has();
}
