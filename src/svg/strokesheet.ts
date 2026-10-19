// strokesheet.ts — the shared stylesheet a tab's SVG thumbnails adopt for the
// preview stroke width (2026-10-19). Changing the width is a single
// `replaceSync`: no SVG is re-parsed, no shadow HTML rewritten, no row
// re-rendered — the browser restyles every preview at once. An empty sheet is
// "default": each document's own widths show. The CSS is built in lib/previewstroke.
// A factory (archive/2026-10-19-upload-preview-stroke): one instance per tab that
// previews a width. SVG to upload no longer does — its STROKE is the export width,
// shown by the live export preview (archive/2026-10-19-upload-default-settings).

import { strokeCss } from "../lib/previewstroke";

type Adopting = ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] };

export interface StrokeSheet {
  /** Sets the width every adopting preview shows; null = each file's own. */
  apply: (px: number | null) => void;
  /** Makes a preview's shadow root follow this sheet (idempotent). */
  adopt: (root: ShadowRoot) => void;
  /** The sheet itself; null where constructable stylesheets are missing (the override is then absent). */
  sheet: () => CSSStyleSheet | null;
}

export function createStrokeSheet(): StrokeSheet {
  let sheet: CSSStyleSheet | null | undefined;
  let current: number | null = null;
  const shared = (): CSSStyleSheet | null => {
    if (sheet !== undefined) return sheet;
    sheet = buildSheet(current);
    return sheet;
  };
  const apply = (px: number | null) => {
    if (px === current && sheet !== undefined) return;
    current = px;
    shared()?.replaceSync(strokeCss(px));
  };
  return { apply, adopt: (root) => adoptInto(root, shared()), sheet: shared };
}

function buildSheet(px: number | null): CSSStyleSheet | null {
  try {
    const built = new CSSStyleSheet();
    built.replaceSync(strokeCss(px));
    return built;
  } catch {
    return null;
  }
}

function adoptInto(root: ShadowRoot, s: CSSStyleSheet | null): void {
  const r = root as Adopting;
  if (s === null || r.adoptedStyleSheets === undefined || r.adoptedStyleSheets.includes(s)) return;
  r.adoptedStyleSheets = [...r.adoptedStyleSheets, s];
}

/** The Generate SVG tab's row thumbnails. */
export const SVG_STROKE_SHEET = createStrokeSheet();
