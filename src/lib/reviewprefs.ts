// reviewprefs.ts — persisted view preferences for Selection review V2
// (spec V2 §2 view modes, §4 thumbnail zoom; RULE 13). Owns the zoom range
// and the stored payload shape: values are clamped and validated on read, so
// a corrupt or hand-edited payload costs one ignored load, never a broken
// panel. The localStorage read/write lives in src/selectionv2/prefsstore.ts.

export const THUMB_MIN = 48;
export const THUMB_MAX = 240;
export const THUMB_STEP = 4;
export const THUMB_DEFAULT = 84;

export type ViewMode = "list" | "compare";

export interface ReviewPrefs {
  mode: ViewMode;
  thumbHeight: number;
}

export const DEFAULT_PREFS: ReviewPrefs = { mode: "list", thumbHeight: THUMB_DEFAULT };

/** Clamps a zoom value into the slider range and snaps it onto its step. */
export function clampThumb(value: number): number {
  if (!Number.isFinite(value)) return THUMB_DEFAULT;
  const snapped = Math.round(value / THUMB_STEP) * THUMB_STEP;
  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, snapped));
}

/**
 * Display height for a thumbnail: the slider value, but never upscaled past
 * the source pixels once they are known (spec V2 §4).
 */
export function thumbHeight(maxPx: number, naturalHeight: number): number {
  return naturalHeight > 0 ? Math.min(maxPx, naturalHeight) : maxPx;
}

/** Readout shown beside the slider, e.g. "128 px". */
export function thumbLabel(px: number): string {
  return `${px} px`;
}

export function serializePrefs(p: ReviewPrefs): string {
  return JSON.stringify(p);
}

/** Stored payload → prefs; anything unusable falls back to the defaults. */
export function parsePrefs(text: string | null): ReviewPrefs {
  const raw = readObject(text);
  const height = raw?.thumbHeight ?? THUMB_DEFAULT;
  return { mode: toMode(raw?.mode), thumbHeight: clampThumb(Number(height)) };
}

function toMode(value: unknown): ViewMode {
  return value === "compare" ? "compare" : "list";
}

function readObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null; // corrupt payload: defaults win, never a crash (RULE 13)
  }
}
