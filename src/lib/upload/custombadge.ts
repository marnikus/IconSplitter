// Custom templates share the bundled badge's placement and the icon-copy bake/expansion pipeline.
import { validateBadgeTemplate } from "./badgetemplate";
import { badgeBounds, badgeFits, type BadgePlacement, type BadgeResult } from "./cornerbadge";
import { isShape, strokeHits } from "./geom/bounds";
import { buildCopy, defineCopyStroke, isolateIds } from "./sizeguidecopy";
import { normalizeStrokeLinecap, setStrokeCap } from "./strokecaps";

export function appendCustomBadge(
  root: Element, board: { width: number; height: number }, placement: BadgePlacement, expand: boolean,
): BadgeResult {
  const source = validateBadgeTemplate(placement.templateSvg ?? "");
  if (!source.ok) return { ok: false, code: "unsupported", detail: `Corner badge: ${source.detail}` };
  const bounds = badgeBounds(board, placement, source.bounds.height / source.bounds.width);
  if (bounds === null) return { ok: false, code: "no-fit", detail: "The corner badge has no measurable room inside the artboard." };
  const cap = normalizeStrokeLinecap(placement.strokeLinecap);
  if (cap !== "source") {
    for (const hit of strokeHits(source.root)) {
      if (isShape(hit.el) && !hit.stroke.none) setStrokeCap(hit.el, cap);
    }
  }
  const copy = buildCopy(root, source.root, {
    bounds: source.bounds, rect: { minX: bounds.x, minY: bounds.y, width: bounds.width, height: bounds.height },
    color: null, strokeWidthPx: null, expand,
  });
  if (!copy.ok) return { ok: false, code: "unsupported", detail: `Corner badge: ${copy.detail}` };
  defineCopyStroke(copy.group);
  isolateIds(copy.group, new Set(Array.from(root.querySelectorAll("[id]")).map((el) => el.id)));
  if (!badgeFits(root, board, [copy.group])) return { ok: false, code: "no-fit", detail: "The corner badge exceeds the artboard." };
  root.appendChild(copy.group);
  return { ok: true, bounds, paths: [copy.group], expanded: copy.expanded };
}
