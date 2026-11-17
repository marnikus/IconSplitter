// lazypreviews.ts — the global "Lazy previews" switch (2026-11-06): on (the
// default), list rows mount their image/SVG preview only near the visible area
// (ui/LazyPreview); off, every row loads its preview at once. Stored per
// browser; anything but "off" reads as on.

import { useSyncExternalStore } from "react";
import { readKey, writeKey } from "../state/safestorage";

export const LAZY_PREVIEWS_KEY = "iconSplitter.ui.lazyPreviews.v1";

const listeners = new Set<() => void>();

export function lazyPreviewsOn(): boolean {
  return readKey(LAZY_PREVIEWS_KEY) !== "off";
}

export function setLazyPreviews(on: boolean): void {
  writeKey(LAZY_PREVIEWS_KEY, on ? "on" : "off");
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLazyPreviews(): boolean {
  return useSyncExternalStore(subscribe, lazyPreviewsOn, lazyPreviewsOn);
}
