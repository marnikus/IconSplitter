// Geometry-only tight bounds. Stroke paint must first be expanded on a detached copy.
import { isShape, unsupportedTag, union, type Bounds } from "./bounds";
import { outlineBounds } from "./curvebounds";
import { shapeOutline, transformOutline } from "./outline";
import { visiblePaint, walkPaintTree } from "./visibility";

export interface TightBounds { bounds: Bounds | null; unsupported: string[] }

/** Same paint visibility/unsupported policy as conservative bounds, with curve extrema. */
export function tightGeometryBounds(root: Element): TightBounds {
  const result: TightBounds = { bounds: null, unsupported: [] };
  walkPaintTree(root, (el, { ctm, stroke, visibility }) => {
    const bad = unsupportedTag(el);
    if (bad !== null) { result.unsupported.push(bad); return; }
    if (!isShape(el) || !visiblePaint(stroke, visibility)) return;
    const outline = shapeOutline(el);
    if (outline === null) return;
    const measured = outlineBounds(transformOutline(outline, ctm));
    if (measured.invalid) { result.unsupported.push("non-finite geometry"); return; }
    if (measured.bounds !== null) result.bounds = result.bounds === null ? measured.bounds : union(result.bounds, measured.bounds);
  });
  result.unsupported = [...new Set(result.unsupported)];
  return result;
}
