// restyle.ts — the configured stroke written onto the placed artwork (RULE 3;
// split out of prepare.ts on 2026-10-09 so the placement loop can re-apply
// it on every candidate). The width is the setting's own number in px,
// VERBATIM (2026-10-08: "2 in the setting is 2 in the SVG") — it runs AFTER
// the bake, so the geometry is already in final px and nothing divides or
// multiplies it; the paint is the configured hex. Each property is later
// defined once by lib/upload/strokeglobal.

import { isShape, strokeHits } from "./geom/bounds";
import { stripStyleKeys } from "./geom/stroke";
import { fmt } from "./geom";
import { readPaint, STROKE_COLOR_ARTWORK, type UploadSettings } from "./settings";

/** What the restyle pass writes onto every visible stroke; null = leave that aspect alone. */
export interface StrokeStyle {
  /** The width in px of the FINAL file — the setting's own number, geometry already baked. */
  widthPx: number | null;
  color: string | null;
}

/** The stroke style the settings ask for: width 0 = the artwork's own; `artwork` colour = the artwork's own. */
export function strokeStyleOf(settings: UploadSettings): StrokeStyle {
  return {
    widthPx: settings.strokePx > 0 ? settings.strokePx : null,
    color: settings.strokeColor === STROKE_COLOR_ARTWORK ? null : readPaint(settings.strokeColor, STROKE_COLOR_ARTWORK),
  };
}

/** One walk over every visible stroke on a shape: width and/or paint, as configured. */
export function restyleStrokes(root: Element, want: StrokeStyle): { widths: number; colors: number } {
  const touched = { widths: 0, colors: 0 };
  if (want.widthPx === null && want.color === null) return touched;
  for (const hit of strokeHits(root)) {
    if (hit.stroke.none || !isShape(hit.el)) continue;
    if (want.widthPx !== null) {
      setStrokeWidth(hit.el, want.widthPx);
      touched.widths++;
    }
    if (want.color !== null) {
      setStrokeColor(hit.el, want.color);
      touched.colors++;
    }
  }
  return touched;
}

/** An explicit width wins over inherited and inline-style values; the setting's number, verbatim. */
function setStrokeWidth(el: Element, width: number): void {
  stripStyleKeys(el, ["stroke-width", "vector-effect"]);
  el.setAttribute("stroke-width", fmt(width));
  el.removeAttribute("vector-effect");
}

/** An explicit paint wins over inherited and inline-style values. */
function setStrokeColor(el: Element, color: string): void {
  stripStyleKeys(el, ["stroke"]);
  el.setAttribute("stroke", color);
}
