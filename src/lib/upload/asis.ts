// asis.ts — "default" for every visual export setting (2026-10-19, user
// request; archive/2026-10-19-upload-default-settings). Default = that aspect
// is left as the approved source has it: the stroke widths and paint, no
// artboard rect, the source's own viewBox size/ratio and its own margins. All
// five at once — with no stroke expansion — is AS IS: the SVG ships byte for byte.

import { BACKGROUND_SOURCE, STROKE_COLOR_ARTWORK, type UploadSettings } from "./settings";
import type { Artboard } from "./artboard";

export const SOURCE_ARTBOARD: Artboard = { mode: "source", size: 512, width: 512, height: 512 };

/** The five visual fields, each at "default" — the dialog's "All default" button writes exactly this. */
export const AS_IS_SETTINGS: Pick<UploadSettings, "paddingPct" | "background" | "strokePx" | "strokeColor" | "artboard"> = {
  paddingPct: null, background: BACKGROUND_SOURCE, strokePx: 0, strokeColor: STROKE_COLOR_ARTWORK, artboard: SOURCE_ARTBOARD,
};

/** True when the export would change nothing visual: the approved SVG ships as it is. */
export function isAsIs(s: UploadSettings): boolean {
  return s.paddingPct === null && s.background === BACKGROUND_SOURCE && s.strokePx === 0
    && s.strokeColor === STROKE_COLOR_ARTWORK && s.artboard.mode === "source" && !s.expandStrokes;
}

/** What "Apply settings to selected" pins: every field but the stroke width, so the bar's STROKE stays live for those icons (an icon pins its own width only in its dialog). */
export function perIconFields(s: UploadSettings): Omit<UploadSettings, "strokePx"> {
  const { strokePx, ...rest } = s;
  void strokePx;
  return rest;
}
