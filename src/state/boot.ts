// boot.ts — installs the restored state before the first render, so no panel
// ever paints default state and then jumps when the session lands.
//
// Two documents, and the selection wins (2026-11-08): the checked rows live in
// the selection document (state/selectionstore). The session snapshot is read
// for the tab and the view, and its own copy of the checks is used ONLY while
// there is no selection document yet — an install upgrading from an older build,
// which kept everything in that one snapshot. Once a pick is made here, the new
// document exists and the snapshot's ids stop being read at all, so a page still
// running the older build cannot bring its stale 100 back.

import { log } from "../log/logstore";
import { buildStamp } from "../lib/buildstamp";
import { withSelectionDoc, type SelectionDoc } from "../lib/selectiondoc";
import type { SessionState } from "../lib/session";
import { loadPrefs } from "../selectionv2/prefsstore";
import { initialAppState, resetAppStore } from "./appstore";
import { loadSelectionDoc } from "./selectionstore";
import { loadSessionState } from "./sessionstore";

export function bootStores(): void {
  const session = loadSessionState();
  const selection = loadSelectionDoc();
  resetAppStore(initialAppState(selection === null ? session : withSelectionDoc(session, selection), loadPrefs()));
  reportRestore(session, selection);
}

/** How many rows came back, and from which document — the reload's own record. */
function reportRestore(session: SessionState, selection: SelectionDoc | null): void {
  const upload = selection?.upload.checked.length ?? session.upload.checked.length;
  const stock = selection?.stockUpload.checked.length ?? session.stockUpload?.checked.length ?? 0;
  const source = selection === null ? "session snapshot (no selection document yet)" : "selection document";
  log({
    level: "debug", feature: "session", action: "restored",
    detail: `build ${buildStamp()}: tab "${session.tab}", ${upload + stock} row(s) selected, restored from the ${source}`,
  });
}
