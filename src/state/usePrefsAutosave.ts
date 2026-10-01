// usePrefsAutosave.ts — writes the V2 view prefs whenever the store's copy
// changes. Mounted above the tabs so an undo applied while the panel is
// unmounted is persisted too, and prefsstore stays their single writer.

import { useEffect, useRef } from "react";
import type { ReviewPrefs } from "../lib/reviewprefs";
import { savePrefs } from "../selectionv2/prefsstore";
import { getAppState, subscribe } from "./appstore";

export function usePrefsAutosave(): void {
  const last = useRef<ReviewPrefs | null>(null);
  useEffect(() => subscribe(() => {
    const prefs = getAppState().prefs;
    if (prefs === last.current) return; // a different slice changed
    last.current = prefs;
    savePrefs(prefs);
  }), []);
}
