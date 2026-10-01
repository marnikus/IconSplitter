// keystore.ts — the Requesty API key (design D3). A browser tool has no OS
// credential manager; the key lives in the same safe localStorage as the
// session, is read raw only by the client path, and every display surface goes
// through maskedKey. Never logged, exported or embedded in reports.

import { maskKey } from "../lib/secrets";
import { readKey, writeKey } from "../state/safestorage";

export const KEY_STORAGE = "iconSplitter.svggen.key.v1";

export function getKey(): string | null {
  return readKey(KEY_STORAGE);
}

export function setKey(key: string): void {
  writeKey(KEY_STORAGE, key);
}

export function clearKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // private mode: nothing was stored
  }
}

export function maskedKey(): string {
  return maskKey(getKey() ?? "");
}
