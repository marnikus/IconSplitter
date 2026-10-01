// prefsstore.ts — Generate SVG view prefs (thumbnail zoom), persisted locally.
// The zoom range and clamping stay in lib/reviewprefs so the SVG tab and the
// Selection V2 tab share ONE definition of "thumbnail height" (RULE 10).

import { clampThumb, THUMB_DEFAULT } from "../lib/reviewprefs";
import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "../lib/isrecord";

export const SVG_PREFS_KEY = "iconSplitter.svg.prefs.v1";

export interface SvgPrefs {
  thumbHeight: number;
}

export const DEFAULT_SVG_PREFS: SvgPrefs = { thumbHeight: THUMB_DEFAULT };

export function parseSvgPrefs(raw: unknown): SvgPrefs {
  if (!isRecord(raw)) return DEFAULT_SVG_PREFS;
  return { thumbHeight: clampThumb(Number(raw.thumbHeight ?? THUMB_DEFAULT)) };
}

export function loadSvgPrefs(): SvgPrefs {
  const text = readKey(SVG_PREFS_KEY);
  if (!text) return DEFAULT_SVG_PREFS;
  try {
    return parseSvgPrefs(JSON.parse(text));
  } catch {
    return DEFAULT_SVG_PREFS;
  }
}

export function saveSvgPrefs(prefs: SvgPrefs): void {
  writeKey(SVG_PREFS_KEY, JSON.stringify(prefs));
}
