// useSessionAutosave.ts — writes the restart snapshot (design doc §6).
//
// Two rules after the 2026-11-08 report ("a new selection is never stored and
// the 100 checks picked before come back after every reload"):
//
// 1. A SELECTION change is written in the same task as the gesture. The
//    debounce stays for everything else (a slider drag is still one write), but
//    the last selection must survive a page that is killed, reloaded by the
//    helper or closed without a clean `pagehide`.
// 2. A page may never write over a snapshot ANOTHER page wrote after this
//    page's last selection change (lib/sessionorder). An idle second tab used to
//    flush its old checks on any later notification and resurrect them.
//
// Mounted above the tabs, so a change on any panel is captured.

import { useEffect } from "react";
import { isForeignNewerWrite, type PageWindow } from "../lib/sessionorder";
import type { LogSpec } from "../lib/log";
import { log } from "../log/logstore";
import { getAppState, sessionOf, subscribe, type AppState } from "./appstore";
import { readStoredStamp, saveSessionState } from "./sessionstore";
import { describeLargest } from "./storagebudget";

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

/** One page's write state: its debounce, its window and its own last stamp. */
interface PageWrites extends PageWindow {
  timer: number;
  slices: SelectionSlices;
}

export function useSessionAutosave(): void {
  useEffect(bindAutosave, []);
}

/** Wires this page's writes and returns the teardown (unmount flushes first). */
function bindAutosave(): () => void {
  const page = newPage();
  const flush = () => { window.clearTimeout(page.timer); page.timer = 0; writeSnapshot(page); };
  const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
  const off = subscribe(() => onStoreChange(page, flush));
  listenForUnload(flush, onHidden);
  return () => {
    flush();
    off();
    stopListeningForUnload(flush, onHidden);
  };
}

function newPage(): PageWrites {
  const opened = Date.now();
  return { timer: 0, slices: selectionSlices(getAppState()), bootedAtMs: opened, changeAtMs: opened, ownStamp: null };
}

/** A selection change IS the write; anything else waits for the burst to end. */
function onStoreChange(page: PageWrites, flush: () => void): void {
  const next = selectionSlices(getAppState());
  const gesture = selectionChanged(page.slices, next);
  page.slices = next;
  if (gesture) {
    // Only a selection change moves this page's claim on the stored checks.
    page.changeAtMs = Date.now();
    flush();
    return;
  }
  window.clearTimeout(page.timer);
  page.timer = window.setTimeout(flush, AUTOSAVE_MS);
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

/** One verified write; refused when another page has already replaced the snapshot. */
function writeSnapshot(page: PageWrites): boolean {
  const now = Date.now();
  if (isForeignNewerWrite(page, readStoredStamp(), now)) return report(KEPT_NEWER);
  const stamp = new Date(now).toISOString();
  const saved = saveSessionState(sessionOf(getAppState()), stamp);
  if (!saved.ok) return report({ ...SAVE_REFUSED, detail: `${SAVE_REFUSED.detail} — browser storage is full; largest stored keys: ${describeLargest()}` });
  if (saved.freed.length > 0) log({ level: "warn", feature: "session", action: "storage-freed",
    detail: `browser storage was full — freed ${saved.freed.join(", ")} so the last selection is stored` });
  page.ownStamp = stamp;
  return true;
}

const KEPT_NEWER: LogSpec = {
  level: "debug", feature: "session", action: "kept-newer-snapshot",
  detail: "another app page stored a newer selection — this page kept it instead of overwriting it",
};

const SAVE_REFUSED: LogSpec = {
  level: "error", feature: "session", action: "save-refused",
  detail: "this browser refused to store the restart snapshot — the last selection will not survive a reload",
};

function report(spec: LogSpec): false {
  log(spec);
  return false;
}
