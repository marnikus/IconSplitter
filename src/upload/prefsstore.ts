// prefsstore.ts — "SVG to upload" view prefs (thumbnail zoom, the preview
// background, whether the provider card is minimized), persisted locally. The
// zoom range and clamping stay in lib/zoom so this tab and the others share
// ONE definition of "thumbnail height" (RULE 10); the background payload is
// validated by lib/svgbackground. The prefs are display-only: the zoom never
// feeds the output scale (design §2.12).

import { clampZoom, ZOOM_DEFAULT } from "../lib/zoom";
import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "../lib/isrecord";

export const UPLOAD_PREFS_KEY = "iconSplitter.upload.prefs.v1";

export interface UploadPrefs {
  thumbHeight: number;
  /** false when the user minimized the provider card to save vertical space. */
  providerOpen: boolean;
  previewBg: PreviewBackground;
}

export const DEFAULT_UPLOAD_PREFS: UploadPrefs = {
  thumbHeight: ZOOM_DEFAULT, providerOpen: true, previewBg: DEFAULT_PREVIEW_BACKGROUND,
};

export function parseUploadPrefs(raw: unknown): UploadPrefs {
  if (!isRecord(raw)) return DEFAULT_UPLOAD_PREFS;
  return {
    thumbHeight: clampZoom(Number(raw.thumbHeight ?? ZOOM_DEFAULT)),
    // Anything that is not an explicit false keeps the card open.
    providerOpen: raw.providerOpen !== false,
    previewBg: parsePreviewBackground(raw.previewBg),
  };
}

export function loadUploadPrefs(): UploadPrefs {
  const text = readKey(UPLOAD_PREFS_KEY);
  if (!text) return DEFAULT_UPLOAD_PREFS;
  try {
    return parseUploadPrefs(JSON.parse(text));
  } catch {
    return DEFAULT_UPLOAD_PREFS;
  }
}

export function saveUploadPrefs(prefs: UploadPrefs): void {
  writeKey(UPLOAD_PREFS_KEY, JSON.stringify(prefs));
}
