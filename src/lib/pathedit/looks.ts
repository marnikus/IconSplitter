// looks.ts — how each shape of the file is drawn, as the shape operations of
// edit mode need it (2026-11-27): its fill and line colours as `#RRGGBB` and
// its pen (caps, joins, miter limit), read from the file's own attributes and
// what it inherits. The edit mode may replace the colours by what the browser
// really draws (a stylesheet can overrule an attribute). Pure.

import { cssToHex } from "./palette";
import type { Pen } from "./strokering";
import { cachedPathTags } from "./svgdoc";

export interface ShapeLook extends Pen {
  /** The fill colour; black when the file names one this app cannot read. */
  fill: string;
  /** The line colour; null when no line is drawn. */
  stroke: string | null;
}

const isNone = (v: string): boolean => v === "none" || v === "transparent";

/** One look per shape of `source`, by shape number. */
export function shapeLooks(source: string): ShapeLook[] {
  return cachedPathTags(source).map((t) => ({
    fill: cssToHex(t.pen.fill) ?? "#000000",
    stroke: isNone(t.pen.stroke) ? null : cssToHex(t.pen.stroke) ?? "#000000",
    cap: t.pen.cap, join: t.pen.join, miter: t.pen.miter,
  }));
}
