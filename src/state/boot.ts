// boot.ts — installs the restored snapshot before the first render, so no panel
// ever paints default state and then jumps when the session lands. The log
// starts first, so everything the restored state does afterwards is on record.

import { bootLog } from "../log/boot";
import { loadPrefs } from "../selectionv2/prefsstore";
import { initialAppState, resetAppStore } from "./appstore";
import { loadSessionState } from "./sessionstore";
import { installTabLog } from "./statelog";

export function bootStores(): void {
  bootLog();
  resetAppStore(initialAppState(loadSessionState(), loadPrefs()));
  installTabLog(); // after the restore, so the tab it restored is not logged as a switch
}
