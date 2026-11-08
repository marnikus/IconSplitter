// useSessionAutosave.ts — writes the restart snapshot above every tab. Tab and
// selection changes flush immediately; less critical bursts are debounced so a
// slider drag is one write (design doc §6).

import { useEffect } from "react";
import { log } from "../log/logstore";
import { getAppState, sessionOf, subscribe, type AppState } from "./appstore";
import { saveSessionState, type SessionSaveResult } from "./sessionstore";

const AUTOSAVE_MS = 250;
let lastReportedSaveResult: SessionSaveResult = "local";

export function useSessionAutosave(): void {
  useEffect(() => {
    let timer = 0;
    let previous = getAppState();
    const flush = () => {
      window.clearTimeout(timer);
      timer = 0;
      save();
    };
    const off = subscribe(() => {
      const next = getAppState();
      const mustPersistNow = hasImmediateSessionChange(previous, next);
      previous = next;
      if (mustPersistNow) {
        // Tabs and row selections are the user's current working position and
        // queue. Save them at the interaction boundary, not after a debounce.
        flush();
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(save, AUTOSAVE_MS);
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      off();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
}

function hasImmediateSessionChange(previous: AppState, next: AppState): boolean {
  return previous.tab !== next.tab
    || previous.view !== next.view
    || previous.v2.checked !== next.v2.checked
    || previous.v2.anchorId !== next.v2.anchorId
    || previous.svg !== next.svg
    || previous.upload !== next.upload
    || previous.builder !== next.builder
    || previous.stockUpload !== next.stockUpload
    || previous.batch !== next.batch;
}

function save(): void {
  const result = saveSessionState(sessionOf(getAppState()), new Date().toISOString());
  if (result === lastReportedSaveResult) return;
  lastReportedSaveResult = result;
  if (result === "session") {
    log({ level: "warn", feature: "session.save", action: "fallback", detail: "localStorage refused the restart snapshot; saved to this tab's sessionStorage, which survives reloads but not closing the tab" });
  } else if (result === "unavailable") {
    log({ level: "error", feature: "session.save", action: "refused", detail: "this browser refused both localStorage and sessionStorage; the last state remains in memory and will not survive a reload" });
  }
}
