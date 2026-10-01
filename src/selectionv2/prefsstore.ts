// prefsstore.ts — localStorage IO for the Selection V2 view prefs (RULE 13).
// Parsing/clamping lives in lib/reviewprefs, so a corrupt payload costs one
// ignored load and a blocked storage (private mode) costs one lost preference.

import { parsePrefs, serializePrefs, type ReviewPrefs } from "../lib/reviewprefs";

export const PREFS_KEY = "iconSplitter.selectionV2.prefs.v1";

export function loadPrefs(): ReviewPrefs {
  return parsePrefs(localStorage.getItem(PREFS_KEY));
}

export function savePrefs(prefs: ReviewPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, serializePrefs(prefs));
  } catch {
    // storage unavailable: the panel keeps working, prefs just do not persist
  }
}
