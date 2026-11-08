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

export type WriteOutcome = "ok" | "quota" | "unavailable";

/** A verified write that says WHY it failed: a full quota, or storage that is blocked / unreadable. */
export function writeKeyChecked(key: string, text: string): WriteOutcome {
  try {
    localStorage.setItem(key, text);
    return localStorage.getItem(key) === text ? "ok" : "unavailable";
  } catch (error) {
    return isQuota(error) ? "quota" : "unavailable";
  }
}

export function hasKey(key: string): boolean {
  return readKey(key) !== null;
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* nothing more can be done */ }
}

function isQuota(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22);
}

export function writeKey(key: string, text: string): void {
  try {
    localStorage.setItem(key, text);
  } catch {
    // nothing persists this run; the app keeps working in memory
  }
}
