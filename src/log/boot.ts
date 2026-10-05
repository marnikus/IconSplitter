// boot.ts — starts the log once per page load: restore what the last session
// persisted (within the stored maximum), install the hooks that flush when the
// page is hidden or closed, and record that the app started. Idempotent — tests
// and StrictMode call boot paths more than once (log-contract.md §4).

import { log } from "./logger";
import { loadLog, loadPrefs } from "./logstorage";
import { flushLog, getLog, hydrate } from "./logstore";

let booted = false;
let hooked = false;

export function bootLog(): void {
  if (booted) return;
  booted = true;
  hydrate(loadLog(), loadPrefs());
  installFlushHooks();
  const { entries, prefs, persist } = getLog();
  log({
    level: "info", feature: "app", action: "boot", message: "Application started",
    data: { restored: entries.length, max: prefs.max, persist },
  });
}

/** The tab may be closed without another event: write what is pending while we still can. */
function installFlushHooks(): void {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("pagehide", flushLog);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLog();
  });
}

/** Tests: boot again as if the page had been reloaded (the hooks stay: they are per page). */
export function resetBoot(): void {
  booted = false;
}
