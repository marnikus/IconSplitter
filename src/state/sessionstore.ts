// sessionstore.ts — localStorage IO for the restart snapshot.
// Validation lives in lib/session, so a corrupt payload costs one ignored load
// and the app opens on its defaults instead of a blank screen (RULE 13).

import { parseSession, serializeSession, type SessionState } from "../lib/session";
import { readKey, writeKey } from "./safestorage";

export const SESSION_KEY = "iconSplitter.session.v1";

export function loadSessionState(): SessionState {
  return parseSession(readKey(SESSION_KEY));
}

export function saveSessionState(session: SessionState, nowIso: string): void {
  writeKey(SESSION_KEY, serializeSession(session, nowIso));
}
