// prefsstore.ts — Generate SVG view prefs (thumbnail zoom, preview background,
// whether the provider card is minimized), persisted locally. The zoom range
// and clamping stay in lib/zoom so the SVG tab and the Selection V2 tab
// share ONE definition of "thumbnail height" (RULE 10); the background payload
// is validated by lib/svgbackground.

import { clampZoom, ZOOM_DEFAULT } from "../lib/zoom";
import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "../lib/isrecord";

export const SVG_PREFS_KEY = "iconSplitter.svg.prefs.v1";

export interface SvgPrefs {
  thumbHeight: number;
  /** false when the user minimized the provider card to save vertical space. */
  providerOpen: boolean;
  previewBg: PreviewBackground;
}

export const DEFAULT_SVG_PREFS: SvgPrefs = {
  thumbHeight: ZOOM_DEFAULT, providerOpen: true, previewBg: DEFAULT_PREVIEW_BACKGROUND,
};

export function parseSvgPrefs(raw: unknown): SvgPrefs {
  if (!isRecord(raw)) return DEFAULT_SVG_PREFS;
  return {
    thumbHeight: clampZoom(Number(raw.thumbHeight ?? ZOOM_DEFAULT)),
    // Anything that is not an explicit false keeps the card open.
    providerOpen: raw.providerOpen !== false,
    previewBg: parsePreviewBackground(raw.previewBg),
  };
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
