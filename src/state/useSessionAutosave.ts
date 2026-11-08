// useSessionAutosave.ts — writes the restart snapshot a moment after the store
// settles. Debounced so a slider drag is one write, and mounted above the tabs
// so a change on any panel is captured (design doc §6).

import { useEffect } from "react";
import { getAppState, sessionOf, subscribe, type AppState } from "./appstore";
import { saveSessionState } from "./sessionstore";

const AUTOSAVE_MS = 250;

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
  saveSessionState(sessionOf(getAppState()), new Date().toISOString());
}
