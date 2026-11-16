// shippedbounds.ts — the bounds of artwork as it SHIPS, split out of place.ts (2026-11-08) so the
// template validators (badge, shadow) can measure a document without depending on the placement
// module that applies them — place → shadow → shadow template → badge validator → place was a cycle.
// place.ts re-exports both, so every existing importer is unchanged.

import { bakeGeometry } from "./bake";
import { expandStrokes } from "./expand";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { identity } from "./geom/matrix";

/** The file is written to 3 decimals; a residual under this is the rounding, not a misfit. */
export const FILE_PRECISION = 0.002;

/** The bounds of the artwork as it ships: strokes measured by their real outline; the analytic bounds when the expander refuses. */
export function shippedBounds(root: Element): Bounds | null {
  const probe = root.cloneNode(true) as Element;
  const exact = bakeGeometry(probe, identity()).unsupported.length === 0 && expandStrokes(probe).refused === null;
  return visibleBounds(exact ? probe : root)?.bounds ?? null;
}

/** True when nothing the document paints lies outside its viewBox (to the file's precision). */
export function insideArtboard(root: Element): boolean {
  const [x, y, w, h] = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const b = shippedBounds(root);
  if (b === null || [x, y, w, h].some((n) => !Number.isFinite(n))) return false;
  return b.minX >= x - FILE_PRECISION && b.minY >= y - FILE_PRECISION
    && b.minX + b.width <= x + w + FILE_PRECISION && b.minY + b.height <= y + h + FILE_PRECISION;
}
