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
import { readStoredStamp, saveSessionState, withStoredSelections } from "./sessionstore";
import { describeLargest } from "./storagebudget";

const AUTOSAVE_MS = 250;

/** The fields a check / lock gesture changes — compared by reference (a scroll is NOT one of them). */
function selectionRefs(s: AppState): readonly unknown[] {
  const tabs = [s.upload, s.stockUpload, s.svg, s.batch];
  return [
    ...tabs.flatMap((t) => [t.checked, t.activeId, t.anchorId]),
    s.builder.checked, s.builder.activeId, s.builder.anchorId, s.builder.lockedIds, s.builder.excludedIds,
    s.v2.checked, s.v2.anchorId, s.view.selectedId,
  ];
}

function sameRefs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Everything else this page stores (tab, options, view) — what an outdated page may still write. */
function otherState(s: AppState): string {
  return JSON.stringify([s.tab, s.sheets, { ...s.view, selectedId: null }, { ...s.v2, checked: null, anchorId: null }]);
}

/** One page's write state: its debounce, its window and its own last stamp. */
interface PageWrites extends PageWindow {
  timer: number;
  refs: readonly unknown[];
  /** `otherState` this page last stored (or booted with): no change of its own = nothing to write. */
  other: string;
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
  const s = getAppState();
  return { timer: 0, refs: selectionRefs(s), other: otherState(s), bootedAtMs: opened, changeAtMs: opened, ownStamp: null };
}

/** A selection change IS the write; anything else waits for the burst to end. */
function onStoreChange(page: PageWrites, flush: () => void): void {
  const next = selectionRefs(getAppState());
  const gesture = !sameRefs(page.refs, next);
  page.refs = next;
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

/**
 * One verified write. When another page stored a newer selection, this page writes only if it changed
 * something of its own (tab, options, view) — and then keeps the stored selections (`withStoredSelections`)
 * and stays "behind" (its own stamp is not adopted), so it can never overwrite that pick later.
 */
function writeSnapshot(page: PageWrites): boolean {
  const now = Date.now();
  const s = getAppState();
  const other = otherState(s);
  const behind = isForeignNewerWrite(page, readStoredStamp(), now);
  if (behind && other === page.other) return report(KEPT_NEWER);
  const stamp = new Date(now).toISOString();
  const saved = saveSessionState(behind ? withStoredSelections(sessionOf(s)) : sessionOf(s), stamp);
  if (!saved.ok) return report(refusedSpec(saved.reason));
  if (saved.freed.length > 0) log({ level: "warn", feature: "session", action: "storage-freed",
    detail: `browser storage was full — freed ${saved.freed.join(", ")} so the last selection is stored` });
  page.other = other;
  if (!behind) page.ownStamp = stamp;
  return true;
}

const KEPT_NEWER: LogSpec = {
  level: "debug", feature: "session", action: "kept-newer-snapshot",
  detail: "another app page stored a newer selection — this page kept it instead of overwriting it",
};

const REFUSED = "this browser refused to store the restart snapshot — the last selection will not survive a reload";

function refusedSpec(reason: "quota" | "unavailable" | null): LogSpec {
  const why = reason === "quota" ? `browser storage is full; largest stored keys: ${describeLargest()}`
    : "browser storage is unavailable here (blocked, private mode or unreadable)";
  return { level: "error", feature: "session", action: "save-refused", detail: `${REFUSED} — ${why}` };
}

function report(spec: LogSpec): false {
  log(spec);
  return false;
}
