// statelog.ts — what the app shell tells the log (log-contract.md §4): which tab
// the user opened, and what the shared undo/redo history did. History entries are
// logged by label, kind, origin and the COUNT of what they touched — never the id
// list (a select-all holds thousands) and never the before/after values. The log
// is not a timeline: nothing here can be undone or replayed (L-3).

import type { HistoryEntry } from "../lib/history";
import type { LogInput } from "../lib/logentry";
import { log } from "../log/logger";
import { getAppState, subscribe } from "./appstore";

/** A recorded action. The ticks of one drag fold into one entry (the gesture key). */
export function logPush(entry: HistoryEntry, gesture: boolean): void {
  const fold: Pick<LogInput, "fold"> = gesture ? { fold: `gesture:${entry.type}` } : {};
  log({
    level: "info", feature: "history", action: "entry.push", message: entry.label, ids: { hist: entry.id },
    data: { type: entry.type, origin: entry.origin, count: entry.ids.length, gesture }, ...fold,
  });
}

/** One direction applied — or refused, which is an error the user was told about. */
export function logApply(dir: "undo" | "redo", entry: HistoryEntry, ok: boolean): void {
  const ids = { hist: entry.id };
  if (!ok) {
    log({ level: "error", feature: "history", action: "apply.failed", message: `Could not ${dir}: ${entry.label}`, ids, data: { type: entry.type } });
    return;
  }
  log({
    level: "info", feature: "history", action: dir, message: `${dir === "undo" ? "Undid" : "Redid"}: ${entry.label}`,
    ids, data: { type: entry.type, origin: entry.origin },
  });
}

let off: (() => void) | null = null;

/** Records every tab switch. Idempotent: boot paths run more than once (tests, StrictMode). */
export function installTabLog(): void {
  if (off !== null) return;
  let last = getAppState().tab;
  off = subscribe(() => {
    const tab = getAppState().tab;
    if (tab === last) return;
    log({ level: "info", feature: "app", action: "tab.open", message: `Opened the ${tab} tab`, data: { from: last, to: tab } });
    last = tab;
  });
}

/** Tests: forget the subscription so the next boot installs a fresh one. */
export function uninstallTabLog(): void {
  off?.();
  off = null;
}
