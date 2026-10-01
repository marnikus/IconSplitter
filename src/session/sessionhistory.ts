// sessionhistory.ts — the app-level settings kind on the global timeline
// (request §3/§9). Values owned by the session store (sheets export options)
// are applied straight through that store, so Undo works even while the Sheets
// tab is hidden; nothing here is a second writer.

import { registerApplier } from "../history/historybus";
import type { SheetsSession } from "../lib/session";
import { SETTINGS_KIND } from "../history/kinds";
import { patchSheets } from "./sessionstore";

/** Registers the session-owned kinds (idempotent, one applier per kind). */
export function registerSessionHistory(): void {
  registerApplier(SETTINGS_KIND, {
    canApply: () => true, // plain settings have no targets that can go stale
    apply: (e, dir) => {
      patchSheets((dir === "undo" ? e.before : e.after) as SheetsSession);
      return true;
    },
  });
}
