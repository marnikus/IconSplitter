// sessionstore.ts — IO for the restart snapshot.
// Validation lives in lib/session, so a corrupt payload costs one ignored load
// and the app opens on its defaults instead of a blank screen (RULE 13).
// localStorage is preferred for cross-tab/browser restarts. If it refuses a
// write, sessionStorage keeps the latest snapshot through page reloads in this
// tab instead of silently restoring an older localStorage snapshot.

import { parseSession, serializeSession, SESSION_VERSION, type SessionState } from "../lib/session";
import { readKey } from "./safestorage";

export const SESSION_KEY = "iconSplitter.session.v1";
export const SESSION_FALLBACK_KEY = "iconSplitter.session.fallback.v1";

export type SessionSaveResult = "local" | "session" | "unavailable";

export function loadSessionState(): SessionState {
  return parseSession(latestSnapshot(readKey(SESSION_KEY), readFallback()));
}

export function saveSessionState(session: SessionState, nowIso: string): SessionSaveResult {
  const text = serializeSession(session, nowIso);
  try {
    localStorage.setItem(SESSION_KEY, text);
    clearFallback();
    return "local";
  } catch {
    try {
      window.sessionStorage.setItem(SESSION_FALLBACK_KEY, text);
      return "session";
    } catch {
      return "unavailable";
    }
  }
}

function readFallback(): string | null {
  try { return window.sessionStorage.getItem(SESSION_FALLBACK_KEY); }
  catch { return null; }
}

function clearFallback(): void {
  try { window.sessionStorage.removeItem(SESSION_FALLBACK_KEY); }
  catch { /* a newer local snapshot wins by savedAt when removal is blocked */ }
}

function latestSnapshot(local: string | null, fallback: string | null): string | null {
  if (local === null) return fallback;
  if (fallback === null) return local;
  return savedAt(fallback) > savedAt(local) ? fallback : local;
}

function savedAt(text: string): number {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || !("v" in value) || value.v !== SESSION_VERSION
      || !("savedAt" in value) || typeof value.savedAt !== "string") return 0;
    const timestamp = Date.parse(value.savedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}
