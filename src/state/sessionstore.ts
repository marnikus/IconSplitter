// sessionstore.ts — localStorage IO for the restart snapshot.
// Validation lives in lib/session, so a corrupt payload costs one ignored load
// and the app opens on its defaults instead of a blank screen (RULE 13).
//
// A write is VERIFIED (2026-11-08): `localStorage.setItem` can refuse (quota,
// blocked storage) and a silent refusal left the browser holding the PREVIOUS
// selection — exactly what came back after a reload. One retry, then an honest
// `false`, so the caller can report it instead of losing the change silently.

import { parseSession, serializeSession, type SessionState } from "../lib/session";
import { readKey } from "./safestorage";
import { writeWithRoom, type RoomedWrite } from "./storagebudget";

export const SESSION_KEY = "iconSplitter.session.v1";

export function loadSessionState(): SessionState {
  return parseSession(readKey(SESSION_KEY));
}

/**
 * The stamp of the stored snapshot, or null. A page compares it with its own
 * last write to tell another page's newer selection from its own (sessionorder).
 */
export function readStoredStamp(): string | null {
  const text = readKey(SESSION_KEY);
  if (text === null) return null;
  try {
    const raw: unknown = JSON.parse(text);
    const savedAt = typeof raw === "object" && raw !== null ? (raw as { savedAt?: unknown }).savedAt : null;
    return typeof savedAt === "string" ? savedAt : null;
  } catch {
    return null;
  }
}

/**
 * Writes the snapshot and proves it landed. When storage is full, rebuildable caches (then the stored log
 * and undo timeline) are evicted until it fits (storagebudget); `freed` names what had to go.
 */
export function saveSessionState(session: SessionState, nowIso: string): RoomedWrite {
  return writeWithRoom(SESSION_KEY, serializeSession(session, nowIso));
}
