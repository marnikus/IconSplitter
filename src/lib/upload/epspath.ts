// epspath.ts — geometry to PostScript path construction (RULE 3): the
// documented EPS subset's shapes (rect, circle, ellipse, line, polyline,
// polygon, path) as `m … l / c … h` sequences of the prolog's short operators
// (2026-11-19 — a drawing program's prolog supplies them, so the body reads as
// geometry). The shape itself comes from the ONE outline model
// (geom/outline.ts) that the export bake also reads, so the EPS and the SVG can
// never disagree about a shape; this file is only the PostScript writer. No
// paint here — eps.ts wraps these with the CTM and the paint state.

import { fmt } from "./geom";
import { pathOutline, shapeOutline, type Outline } from "./geom/outline";

/** PS path construction for one shape element; null when outside the subset. */
export function shapePathPs(el: Element): string | null {
  const outline = shapeOutline(el);
  return outline === null ? null : outlineToPs(outline);
}

/** Path data → PS path construction; null when the data has no commands. */
export function pathDataPs(d: string | null): string | null {
  const outline = pathOutline(d);
  return outline === null ? null : outlineToPs(outline);
}

/** The outline as `x y m`, `x y l`, `x1 y1 x2 y2 x y c`, `h` — space separated. */
export function outlineToPs(o: Outline): string {
  const out: string[] = [];
  for (const op of o.ops) {
    if (op.op === "Z") out.push("h");
    else if (op.op === "C") out.push(`${fmt(op.x1)} ${fmt(op.y1)} ${fmt(op.x2)} ${fmt(op.y2)} ${fmt(op.x)} ${fmt(op.y)} c`);
    else out.push(`${fmt(op.x)} ${fmt(op.y)} ${op.op === "M" ? "m" : "l"}`);
  }
  return out.join(" ");
}
