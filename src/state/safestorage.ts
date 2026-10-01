// safestorage.ts — localStorage without the two ways it can throw: private
// browsing (no storage at all) and a quota hit. UI state is worth losing; a
// crash on startup is not (RULE 13).

export function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKey(key: string, text: string): void {
  try {
    localStorage.setItem(key, text);
  } catch {
    // nothing persists this run; the app keeps working in memory
  }
}
