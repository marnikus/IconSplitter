// useSheetsEdit.ts — the Sheets export settings live in the store above the
// tabs, so they survive a tab switch and a restart, and every change is one
// undoable action. The padding slider drags, so its entries coalesce into a
// single gesture instead of one entry per pixel.

import { useCallback } from "react";
import { SIZES, type SheetOpts } from "../lib/exportopts";
import { getAppState, setAppState } from "../state/appstore";
import { useAppState } from "../state/useAppState";
import { useHistory } from "../state/HistoryProvider";

export interface SheetsEdit {
  opts: SheetOpts;
  pad: (value: number) => void;
  size: (value: number) => void;
  transparent: (value: boolean) => void;
}

export function useSheetsEdit(): SheetsEdit {
  const opts = useAppState().sheets;
  const hist = useHistory();
  const apply = useCallback((patch: Partial<SheetOpts>, label: string, id: string, gesture: boolean) => {
    const before = getAppState().sheets;
    const after = { ...before, ...patch };
    setAppState({ sheets: after });
    const entry = { type: "sheets", label, origin: "sheets", ids: [id], before, after };
    if (gesture) hist.pushGesture(entry);
    else hist.push(entry);
  }, [hist]);
  return {
    opts,
    pad: useCallback((value: number) => apply({ padding: value }, `Padding ${value}%`, "padding", true), [apply]),
    size: useCallback((value: number) => apply({ size: value }, `Square size ${sizeName(value)}`, "size", false), [apply]),
    transparent: useCallback(
      (value: boolean) => apply({ transparent: value }, value ? "Transparent background on" : "Transparent background off", "transparent", false),
      [apply],
    ),
  };
}

function sizeName(value: number): string {
  return SIZES.find((s) => s.v === value)?.l ?? `${value} px`;
}
