// boot.ts — installs the restored snapshot before the first render, so no panel
// ever paints default state and then jumps when the session lands.

import { loadPrefs } from "../selectionv2/prefsstore";
import { initialAppState, resetAppStore } from "./appstore";
import { loadSessionState } from "./sessionstore";

export function bootStores(): void {
  resetAppStore(initialAppState(loadSessionState(), loadPrefs()));
}
