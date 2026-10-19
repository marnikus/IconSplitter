// strokesheet.ts — the ONE stylesheet every row thumbnail's shadow root adopts
// for the preview stroke width (2026-10-19). Changing the width is a single
// `replaceSync`: no SVG is re-parsed, no shadow HTML rewritten, no row
// re-rendered — the browser restyles every preview at once. An empty sheet is
// "default": each document's own widths show. The CSS is built in lib/previewstroke.

import { strokeCss } from "../lib/previewstroke";

type Adopting = ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] };

let sheet: CSSStyleSheet | null | undefined;
let current: number | null = null;

/** Lazily built; null where constructable stylesheets are missing (the override is then simply absent). */
function shared(): CSSStyleSheet | null {
  if (sheet !== undefined) return sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(strokeCss(current));
  } catch {
    sheet = null;
  }
  return sheet;
}

/** Sets the width every adopting preview shows; null = each file's own. */
export function applyPreviewStroke(px: number | null): void {
  if (px === current && sheet !== undefined) return;
  current = px;
  shared()?.replaceSync(strokeCss(px));
}

/** Makes a preview's shadow root follow the shared width (idempotent). */
export function adoptPreviewStroke(root: ShadowRoot): void {
  const s = shared();
  const r = root as Adopting;
  if (s === null || r.adoptedStyleSheets === undefined || r.adoptedStyleSheets.includes(s)) return;
  r.adoptedStyleSheets = [...r.adoptedStyleSheets, s];
}
