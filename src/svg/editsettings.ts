// editsettings.ts — "Edit settings" for the SVG anchor views (2026-11-06): the
// anchor point size in screen pixels, used by the path editor and by the
// Ctrl-hover anchor dots, and the click tolerance for picking a shape.
// Stored on this device, validated on read (RULE 13).

import { useSyncExternalStore } from "react";
import { HIT_PX } from "../lib/pathedit/gesture";

export const EDIT_SETTINGS_KEY = "iconSplitter.svg.editSettings.v1";
export const ANCHOR_PX_MIN = 4;
export const ANCHOR_PX_MAX = 24;
export const ANCHOR_PX_DEFAULT = 10;
export const PICK_PX_MIN = 2;
export const PICK_PX_MAX = 40;
export const PICK_PX_DEFAULT = HIT_PX.pick;

export interface EditSettings {
  /** The drawn anchor's diameter in screen pixels (handles are drawn a little smaller). */
  anchorPx: number;
  /** How far (screen px) from a shape's line a single click still selects that shape. */
  pickPx: number;
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

export const clampAnchorPx = (n: unknown): number => clamp(n, ANCHOR_PX_MIN, ANCHOR_PX_MAX, ANCHOR_PX_DEFAULT);
export const clampPickPx = (n: unknown): number => clamp(n, PICK_PX_MIN, PICK_PX_MAX, PICK_PX_DEFAULT);

const DEFAULTS: EditSettings = { anchorPx: ANCHOR_PX_DEFAULT, pickPx: PICK_PX_DEFAULT };

function read(): EditSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(EDIT_SETTINGS_KEY) ?? "{}") as { anchorPx?: unknown; pickPx?: unknown };
    return { anchorPx: clampAnchorPx(raw.anchorPx), pickPx: clampPickPx(raw.pickPx) };
  } catch {
    return DEFAULTS;
  }
}

let current: EditSettings | null = null;
const listeners = new Set<() => void>();

export function getEditSettings(): EditSettings {
  current ??= read();
  return current;
}

export function setEditSettings(patch: Partial<EditSettings>): void {
  const now = getEditSettings();
  current = { anchorPx: clampAnchorPx(patch.anchorPx ?? now.anchorPx), pickPx: clampPickPx(patch.pickPx ?? now.pickPx) };
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
