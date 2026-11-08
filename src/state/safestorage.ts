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

/**
 * Writes and proves the document landed (2026-11-08). `setItem` can refuse
 * silently (quota, blocked storage) and the browser then keeps holding the
 * PREVIOUS selection — exactly what came back after a reload. One retry (a
 * concurrent write may free room), then an honest `false` so the caller can say
 * so instead of losing the change without a word.
 */
export function writeVerified(key: string, text: string): boolean {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    writeKey(key, text);
    if (readKey(key) === text) return true;
  }
  return false;
}

/** The `savedAt` stamp of a stored JSON document, or null when unreadable. */
export function readSavedAt(key: string): string | null {
  const text = readKey(key);
  if (text === null) return null;
  try {
    const raw: unknown = JSON.parse(text);
    const savedAt = typeof raw === "object" && raw !== null ? (raw as { savedAt?: unknown }).savedAt : null;
    return typeof savedAt === "string" ? savedAt : null;
  } catch {
    return null;
  }
}
