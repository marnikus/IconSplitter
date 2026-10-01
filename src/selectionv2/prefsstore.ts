// prefsstore.ts — the LEGACY view-prefs key from before the session payload
// existed. Nothing writes it any more (the session owns the value, RULE 10);
// it is read once so an existing user keeps the layout and zoom they chose.

import { parsePrefs, type ReviewPrefs } from "../lib/reviewprefs";

export const PREFS_KEY = "iconSplitter.selectionV2.prefs.v1";

/** The pre-session prefs, or null when the user never had any. */
export function readLegacyPrefs(): ReviewPrefs | null {
  try {
    const text = localStorage.getItem(PREFS_KEY);
    return text ? parsePrefs(text) : null;
  } catch {
    return null;
  }
}
