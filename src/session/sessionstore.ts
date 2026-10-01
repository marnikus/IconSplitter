// sessionstore.ts — the persisted app session (request §1, RULE 13).
// One localStorage key holding one complete, validated document. The store is
// read once at module load — before the first render — so a restore can never
// arrive late and overwrite a newer user change. Writes are single whole-
// document writes; the review slice is written by `selectionmirror.ts`.

import { DEFAULT_SESSION, defaultReviewSession, parseSession, serializeSession, type AppSession, type ReviewSession, type SheetsSession, type TabId } from "../lib/session";
import { createStore } from "../store/store";
import { readLegacyPrefs } from "../selectionv2/prefsstore";

export const SESSION_KEY = "iconSplitter.session.v1";

/** Read + validate the stored session exactly once (boot). */
export function readSession(): AppSession {
  return migrateLegacy(parseSession(readRaw()));
}

/** Blocked storage costs the session, never the app (RULE 13). */
function readRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Pre-session installs keep their layout/zoom (one-time, read-only). */
function migrateLegacy(session: AppSession): AppSession {
  if (session.review) return session;
  const prefs = readLegacyPrefs();
  return prefs ? { ...session, review: { ...defaultReviewSession(), prefs } } : session;
}

/** The store object itself, for `useStore` (components never copy state). */
export const sessionStore = createStore<AppSession>(readSession());
const store = sessionStore;

export function getSession(): AppSession {
  return store.get();
}

export function subscribeSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** One write, one complete document (RULE 23-style atomicity for storage). */
export function patchSession(part: Partial<AppSession>): void {
  store.set((prev) => ({ ...prev, ...part, savedAt: Date.now() }));
  saveSession();
}

export function setSessionTab(tab: TabId): void {
  patchSession({ tab });
}

export function patchSheets(part: Partial<SheetsSession>): void {
  patchSession({ sheets: { ...store.get().sheets, ...part } });
}

export function setReviewSession(review: ReviewSession | null): void {
  patchSession({ review });
}

/** Test hook: forget everything without touching storage. */
export function resetSessionStoreForTests(): void {
  store.set(() => DEFAULT_SESSION);
}

function saveSession(): void {
  try {
    localStorage.setItem(SESSION_KEY, serializeSession(store.get()));
  } catch {
    // private mode / quota: the app keeps working, the session just is not kept
  }
}
