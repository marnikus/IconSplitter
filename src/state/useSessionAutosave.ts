// useSessionAutosave.ts — writes the restart snapshot a moment after the store
// settles. Debounced so a slider drag is one write, and mounted above the tabs
// so a change on any panel is captured (design doc §6).

import { useEffect } from "react";
import { getAppState, sessionOf, subscribe } from "./appstore";
import { saveSessionState } from "./sessionstore";

const AUTOSAVE_MS = 250;

export function useSessionAutosave(): void {
  useEffect(() => {
    let timer = 0;
    const off = subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, AUTOSAVE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, []);
}

function save(): void {
  saveSessionState(sessionOf(getAppState()), new Date().toISOString());
}
