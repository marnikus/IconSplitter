// listviewstore.ts — a tab's list view survives a reload (2026-11-06): the
// filters, the search text and the sort it was left with. One store for every
// tab that keeps its view this way; each tab parses its own entry (RULE 13:
// anything unknown falls back to the default, a damaged entry is ignored).

import { useEffect, useRef } from "react";

export const LIST_VIEW_KEYS = {
  svg: "iconSplitter.svg.listView.v1",
  upload: "iconSplitter.upload.listView.v1",
  stock: "iconSplitter.stockUpload.listView.v1",
} as const;

/** The stored entry through the tab's own parser; the parser's defaults when there is none. */
export function loadListView<T>(key: string, parse: (raw: unknown) => T): T {
  try {
    return parse(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return parse(null);
  }
}

export function saveListView(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* kept for this session only */ }
}

/** Writes the view whenever it really changes. */
export function useSaveListView(key: string, value: unknown): void {
  const text = JSON.stringify(value);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === text) return;
    last.current = text;
    saveListView(key, value);
  }, [key, text, value]);
}
