// imgprefs.ts — validated local preference for icons per image-edit request.
// Independent of SVG text batching and the provider's output image count.

import { DEFAULT_EDIT_COUNT, MAX_EDIT_COUNT } from "../lib/svgimgbatch";
import { readKey, writeKey } from "../state/safestorage";

export const IMAGE_EDIT_PREF_KEY = "iconSplitter.svg.imageEditBatch.v1";
export interface ImageEditPref { count: number; warning: boolean }

export function parseImageEditPref(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as { v?: unknown; count?: unknown };
  if (value.v !== 1 || !Number.isInteger(value.count)) return null;
  const count = value.count as number;
  return count >= 1 && count <= MAX_EDIT_COUNT ? count : null;
}

export function loadImageEditPref(): ImageEditPref {
  const text = readKey(IMAGE_EDIT_PREF_KEY);
  if (text === null) return { count: DEFAULT_EDIT_COUNT, warning: false };
  try {
    const count = parseImageEditPref(JSON.parse(text));
    return count === null ? { count: DEFAULT_EDIT_COUNT, warning: true } : { count, warning: false };
  } catch {
    return { count: DEFAULT_EDIT_COUNT, warning: true };
  }
}

export function saveImageEditPref(count: number): void {
  if (Number.isInteger(count) && count >= 1 && count <= MAX_EDIT_COUNT) {
    writeKey(IMAGE_EDIT_PREF_KEY, JSON.stringify({ v: 1, count }));
  }
}
