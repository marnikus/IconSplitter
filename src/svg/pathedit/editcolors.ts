// editcolors.ts — the edit mode's colours, remembered on this device
// (2026-11-27): the current colour, the second colour and the saved swatches
// (lib/pathedit/palette). Read once, validated (RULE 13), written on change.

import { useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, parsePalette, type Palette } from "../../lib/pathedit/palette";

export const EDIT_COLORS_KEY = "iconSplitter.svg.editColors.v1";

let current: Palette | null = null;
const listeners = new Set<() => void>();

function read(): Palette {
  try {
    return parsePalette(JSON.parse(localStorage.getItem(EDIT_COLORS_KEY) ?? "null"));
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function getPalette(): Palette {
  current ??= read();
  return current;
}

/** Applies one palette change (a pure function of lib/pathedit/palette) and remembers the result. */
export function changePalette(change: (p: Palette) => Palette): void {
  const next = change(getPalette());
  if (next === current) return;
  current = next;
  try { localStorage.setItem(EDIT_COLORS_KEY, JSON.stringify(next)); } catch { /* kept for this session */ }
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function usePalette(): Palette {
  return useSyncExternalStore(subscribe, getPalette, getPalette);
}

/** Tests only: forget the cached palette so the next read comes from storage. */
export function resetPaletteCache(): void { current = null; }
