// editsettings.ts — "Edit settings" for the SVG anchor views (2026-11-06): the
// anchor point size in screen pixels, used by the path editor and by the
// Ctrl-hover anchor dots. Stored on this device, validated on read (RULE 13).

import { useSyncExternalStore } from "react";

export const EDIT_SETTINGS_KEY = "iconSplitter.svg.editSettings.v1";
export const ANCHOR_PX_MIN = 4;
export const ANCHOR_PX_MAX = 24;
export const ANCHOR_PX_DEFAULT = 10;

export interface EditSettings {
  /** The drawn anchor's diameter in screen pixels (handles are drawn a little smaller). */
  anchorPx: number;
}

export function clampAnchorPx(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : ANCHOR_PX_DEFAULT;
  return Math.min(ANCHOR_PX_MAX, Math.max(ANCHOR_PX_MIN, v));
}

function read(): EditSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(EDIT_SETTINGS_KEY) ?? "{}") as { anchorPx?: unknown };
    return { anchorPx: clampAnchorPx(raw.anchorPx) };
  } catch {
    return { anchorPx: ANCHOR_PX_DEFAULT };
  }
}

let current: EditSettings | null = null;
const listeners = new Set<() => void>();

export function getEditSettings(): EditSettings {
  current ??= read();
  return current;
}

export function setEditSettings(patch: Partial<EditSettings>): void {
  current = { anchorPx: clampAnchorPx(patch.anchorPx ?? getEditSettings().anchorPx) };
  try { localStorage.setItem(EDIT_SETTINGS_KEY, JSON.stringify(current)); } catch { /* kept for this session */ }
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useEditSettings(): EditSettings {
  return useSyncExternalStore(subscribe, getEditSettings);
}

/** Tests start from the stored value again. */
export function forgetEditSettings(): void {
  current = null;
}
