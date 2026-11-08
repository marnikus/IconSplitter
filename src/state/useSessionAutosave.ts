// useSessionAutosave.ts — writes what a restart must remember (design doc §6).
//
// Two documents, one owner each (2026-11-08):
//
// 1. The SELECTION document (state/selectionstore) is the only place the checked
//    rows live, and a check gesture writes it in the same task. Nothing else may
//    hold a second copy: an older build's page keeps its checks in the session
//    snapshot, and while both keys carried them an idle tab could flush its stale
//    100 over a newer pick and the reload showed the old checks again.
// 2. The SESSION snapshot (state/sessionstore) keeps the tab, the sheets options
//    and the view filters; its writes stay debounced, and it is stored with the
//    selections emptied.
//
// A page may still not write over a document ANOTHER page wrote after this
// page's last change to that document (lib/sessionorder) — the check for a
// frozen tab coming back with an outdated store.

import { useEffect } from "react";
import { isForeignNewerWrite, type PageWindow } from "../lib/sessionorder";
import { selectionDocOf, clearSelectionOf } from "../lib/selectiondoc";
import type { LogSpec } from "../lib/log";
import { log } from "../log/logstore";
import { getAppState, sessionOf, subscribe, type AppState } from "./appstore";
import { readSelectionStamp, saveSelectionDoc } from "./selectionstore";
import { readStoredStamp, saveSessionState } from "./sessionstore";

const AUTOSAVE_MS = 250;

/** The slices a check gesture changes — compared by reference, never by value. */
const SELECTION_KEYS = ["upload", "stockUpload", "svg", "builder", "batch", "v2"] as const;
type SelectionSlices = Record<(typeof SELECTION_KEYS)[number], unknown>;

function selectionSlices(s: AppState): SelectionSlices {
  return { upload: s.upload, stockUpload: s.stockUpload, svg: s.svg, builder: s.builder, batch: s.batch, v2: s.v2 };
}

function selectionChanged(before: SelectionSlices, after: SelectionSlices): boolean {
  return SELECTION_KEYS.some((key) => before[key] !== after[key]);
}

/** One document's claim on the timeline: last change here, own last stamp. */
interface Claim {
  changeAtMs: number;
  ownStamp: string | null;
}

/** One page's write state: its debounce, its window and a claim per document. */
interface PageWrites {
  timer: number;
  slices: SelectionSlices;
  bootedAtMs: number;
  selection: Claim;
  session: Claim;
}

export function useSessionAutosave(): void {
  useEffect(bindAutosave, []);
}

/** Wires this page's writes and returns the teardown (unmount flushes first). */
function bindAutosave(): () => void {
  const page = newPage();
  const flushAll = () => { window.clearTimeout(page.timer); page.timer = 0; writeSelection(page); writeSession(page); };
  const onHidden = () => { if (document.visibilityState === "hidden") flushAll(); };
  const off = subscribe(() => onStoreChange(page));
  listenForUnload(flushAll, onHidden);
  // First run of this build: the document is missing even though the store may
  // hold picks migrated from the older session snapshot. Write them now, so the
  // snapshot's copy stops being the one the next reload would read.
  if (readSelectionStamp() === null) writeSelection(page);
  return () => {
    flushAll();
    off();
    stopListeningForUnload(flushAll, onHidden);
  };
}

function newPage(): PageWrites {
  const opened = Date.now();
  const claim = (): Claim => ({ changeAtMs: opened, ownStamp: null });
  return { timer: 0, slices: selectionSlices(getAppState()), bootedAtMs: opened, selection: claim(), session: claim() };
}

/** A selection change IS the write; anything else waits for the burst to end. */
function onStoreChange(page: PageWrites): void {
  const next = selectionSlices(getAppState());
  const gesture = selectionChanged(page.slices, next);
  page.slices = next;
  if (gesture) {
    page.selection.changeAtMs = Date.now();
    writeSelection(page);
    return;
  }
  page.session.changeAtMs = Date.now();
  window.clearTimeout(page.timer);
  page.timer = window.setTimeout(() => { page.timer = 0; writeSession(page); }, AUTOSAVE_MS);
}

/** Every way a page can go away — a frozen tab may never see `pagehide`. */
function listenForUnload(flush: () => void, onHidden: () => void): void {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", onHidden);
}

function stopListeningForUnload(flush: () => void, onHidden: () => void): void {
  window.removeEventListener("pagehide", flush);
  window.removeEventListener("beforeunload", flush);
  document.removeEventListener("visibilitychange", onHidden);
}

/** The window a claim makes, as sessionorder reads it. */
function windowOf(page: PageWrites, claim: Claim): PageWindow {
  return { bootedAtMs: page.bootedAtMs, changeAtMs: claim.changeAtMs, ownStamp: claim.ownStamp };
}

/** Writes the checked rows; refused when another page stored a newer pick. */
function writeSelection(page: PageWrites): boolean {
  const now = Date.now();
  if (isForeignNewerWrite(windowOf(page, page.selection), readSelectionStamp(), now)) return report(KEPT_NEWER);
  const stamp = new Date(now).toISOString();
  if (!saveSelectionDoc(selectionDocOf(sessionOf(getAppState())), stamp)) return report(SAVE_REFUSED);
  page.selection.ownStamp = stamp;
  return true;
}

/** Writes the tab and view state, with the selections left to their document. */
function writeSession(page: PageWrites): boolean {
  const now = Date.now();
  if (isForeignNewerWrite(windowOf(page, page.session), readStoredStamp(), now)) return report(KEPT_NEWER);
  const stamp = new Date(now).toISOString();
  if (!saveSessionState(clearSelectionOf(sessionOf(getAppState())), stamp)) return report(SAVE_REFUSED);
  page.session.ownStamp = stamp;
  return true;
}

const KEPT_NEWER: LogSpec = {
  level: "debug", feature: "session", action: "kept-newer-snapshot",
  detail: "another app page stored a newer state — this page kept it instead of overwriting it",
};

const SAVE_REFUSED: LogSpec = {
  level: "error", feature: "session", action: "save-refused",
  detail: "this browser refused to store the selection — the last pick will not survive a reload",
};

function report(spec: LogSpec): false {
  log(spec);
  return false;
}
