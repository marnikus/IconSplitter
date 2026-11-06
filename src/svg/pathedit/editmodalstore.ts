// editmodalstore.ts — which row the full-screen edit mode has open (2026-11-06).
// A row's ✎ Edit opens it, Cancel / Finish close it; the panel's modal follows.

import { useSyncExternalStore } from "react";

let openId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const fn of [...listeners]) fn(); };

export function openSvgEditor(id: string): void { openId = id; emit(); }
export function closeSvgEditor(): void { openId = null; emit(); }
export function getSvgEditorId(): string | null { return openId; }

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useSvgEditorId(): string | null {
  return useSyncExternalStore(subscribe, getSvgEditorId);
}
