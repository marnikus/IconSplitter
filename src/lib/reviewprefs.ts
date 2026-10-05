// reviewprefs.ts — persisted view preferences for Selection review V2
// (spec V2 §2 view modes, §4 thumbnail zoom; RULE 13). Owns the stored payload
// shape: values are clamped and validated on read, so a corrupt or hand-edited
// payload costs one ignored load, never a broken panel. The zoom RANGE and the
// size rule are shared with the Generate SVG tab and live in lib/zoom (I-55);
// the localStorage read/write lives in src/selectionv2/prefsstore.ts.

import { isRecord } from "./isrecord";
import { clampZoom, ZOOM_DEFAULT } from "./zoom";

export type ViewMode = "list" | "compare";

/** Detail-view scaling for a single pair (Selection review V1). */
export type ZoomMode = "fit" | "full";

export interface ReviewPrefs {
  mode: ViewMode;
  thumbHeight: number;
}

export const DEFAULT_PREFS: ReviewPrefs = { mode: "list", thumbHeight: ZOOM_DEFAULT };

export function serializePrefs(p: ReviewPrefs): string {
  return JSON.stringify(p);
}

/** Stored payload → prefs; anything unusable falls back to the defaults. */
export function parsePrefs(text: string | null): ReviewPrefs {
  return parsePrefsValue(readObject(text));
}

/** Same validation for an in-memory value (a history entry being re-applied). */
export function parsePrefsValue(raw: unknown): ReviewPrefs {
  if (!isRecord(raw)) return DEFAULT_PREFS;
  return { mode: toMode(raw.mode), thumbHeight: clampZoom(Number(raw.thumbHeight ?? ZOOM_DEFAULT)) };
}

function toMode(value: unknown): ViewMode {
  return value === "compare" ? "compare" : "list";
}

function readObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? data : null;
  } catch {
    return null; // corrupt payload: defaults win, never a crash (RULE 13)
  }
}
