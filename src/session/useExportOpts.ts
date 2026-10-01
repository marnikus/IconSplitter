// useExportOpts.ts — the single-sheet export settings (padding, size,
// transparent). Persisted in the session (request §1) and recorded on the
// global timeline as one reversible `settings` action per gesture (request §3),
// so a slider drag is one entry and redo/undo work from any tab.

import { useCallback } from "react";
import { entry } from "../lib/history";
import { SETTINGS_KIND } from "../history/kinds";
import { recordEntry } from "../history/historybus";
import type { SheetsSession } from "../lib/session";
import { useStore } from "../store/store";
import { getSession, patchSheets, sessionStore } from "./sessionstore";
import { registerSessionHistory } from "./sessionhistory";

export interface ExportOptsApi {
  padding: number;
  size: number;
  transparent: boolean;
  setPadding: (v: number) => void;
  setSize: (v: number) => void;
  setTransparent: (v: boolean) => void;
}

export function useExportOpts(): ExportOptsApi {
  const sheets = useStore(sessionStore).sheets;
  const set = useCallback(setSheetsValue, []);
  return {
    padding: sheets.padding,
    size: sheets.size,
    transparent: sheets.transparent,
    setPadding: useCallback((v: number) => set({ padding: v }, `Padding ${v}%`, "sheet-padding"), [set]),
    setSize: useCallback((v: number) => set({ size: v }, `Output size ${v === 0 ? "native" : `${v} px`}`), [set]),
    setTransparent: useCallback((v: boolean) => set({ transparent: v }, `Transparent background ${v ? "on" : "off"}`), [set]),
  };
}

/** One gesture = one entry; the value itself always updates first (RULE 24). */
function setSheetsValue(part: Partial<SheetsSession>, label: string, coalesce?: string): void {
  const before = getSession().sheets;
  const after = { ...before, ...part };
  patchSheets(part);
  recordEntry(entry({ kind: SETTINGS_KIND, label, tab: "sheets", targets: [], before, after, coalesce }));
}

registerSessionHistory();
