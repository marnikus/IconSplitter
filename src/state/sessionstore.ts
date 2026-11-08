// sessionstore.ts — localStorage IO for the restart snapshot.
// Validation lives in lib/session, so a corrupt payload costs one ignored load
// and the app opens on its defaults instead of a blank screen (RULE 13).
//
// The snapshot no longer carries the checked ids: the selection document owns
// them (lib/selectiondoc, state/selectionstore). What is stored here is the tab,
// the sheets options, the view filters and the active rows.

import { parseSession, serializeSession, type SessionState } from "../lib/session";
import { readKey, readSavedAt, writeVerified } from "./safestorage";

export const SESSION_KEY = "iconSplitter.session.v1";

export function loadSessionState(): SessionState {
  return parseSession(readKey(SESSION_KEY));
}

/**
 * The stamp of the stored snapshot, or null. A page compares it with its own
 * last write to tell another page's newer state from its own (sessionorder).
 */
export function readStoredStamp(): string | null {
  return readSavedAt(SESSION_KEY);
}

/** Writes the snapshot and proves it landed; true when storage holds it now. */
export function saveSessionState(session: SessionState, nowIso: string): boolean {
  return writeVerified(SESSION_KEY, serializeSession(session, nowIso));
}
