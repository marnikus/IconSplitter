// selectionmirror.ts — writes the review slice of the session (request §1).
// The selection store owns the value; this mirror only persists it, so there is
// still exactly ONE writer per value. Restoring happens in the other direction
// at store init (`selectionstore.seedFromSession`), and the mirror never records
// history — a restore must not flood the timeline (request §8).

import type { ReviewSession } from "../lib/session";
import type { SelState } from "../selection/state";
import { getSelState, subscribeSel } from "../selection/selectionstore";
import { getSession, setReviewSession } from "./sessionstore";

/** The persisted view state of the review surfaces, V1 and V2 together. */
export function reviewSlice(s: SelState): ReviewSession {
  return {
    rootName: s.rootName,
    filter: s.filter,
    sort: s.sort,
    checked: [...s.checked],
    selectedId: s.selectedId,
    prefs: { ...s.prefs },
    watcher: s.watcher,
    collapsed: s.collapsed,
    zoom: s.zoom,
    sync: s.sync,
    autoNext: s.autoNext,
    scroll: getSession().review?.scroll ?? {},
  };
}

let installed = false;
let lastWritten = "";

/** Installs the write-through mirror once per session (idempotent). */
export function ensureSelectionMirror(): void {
  if (installed) return;
  installed = true;
  const push = (s: SelState) => {
    const text = JSON.stringify(reviewSlice(s));
    if (text === lastWritten) return; // busy/toast writes must not touch storage
    lastWritten = text;
    setReviewSession(reviewSlice(s));
  };
  push(getSelState());
  subscribeSel(() => push(getSelState()));
}

export function resetSelectionMirrorForTests(): void {
  installed = false;
  lastWritten = "";
}
