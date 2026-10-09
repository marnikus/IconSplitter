// shapes.ts — the basic shapes as outlines (RULE 3, 2026-10-08): rect (a
// rounded one too — four lines and four KAPPA quarter-ellipses, the SVG
// radius rules applied exactly), circle/ellipse (the four-cubic split), line,
// polyline and polygon. `outline.ts` dispatches here; `<path>` data has its own
// grammar there.

import { KAPPA, cv, ln, mv, num, type Outline, type OutlineOp } from "./ops";

export function rectOutline(el: Element): Outline | null {
  const w = num(el.getAttribute("width"));
  const h = num(el.getAttribute("height"));
  if (!(w > 0) || !(h > 0)) return null;
  const x = num(el.getAttribute("x"));
  const y = num(el.getAttribute("y"));
  const [rx, ry] = rectRadii(el, w, h);
  if (rx === 0 || ry === 0) return { ops: [mv(x, y), ln(x + w, y), ln(x + w, y + h), ln(x, y + h), { op: "Z" }] };
  return roundedRectOutline({ x, y, w, h }, rx, ry);
}

/**
 * The corner radii the SVG spec resolves (2026-10-08): a missing one copies the
 * other, a negative one is ignored, each is clamped to half its side. Exact —
 * nothing of the artwork is scaled or squeezed, so a pill stays a pill.
 */
export function rectRadii(el: Element, w: number, h: number): [number, number] {
  const rawX = el.getAttribute("rx");
  const rawY = el.getAttribute("ry");
  const given = (raw: string | null) => (raw === null ? null : Math.max(0, num(raw)));
  const gx = given(rawX);
  const gy = given(rawY);
  const rx = gx ?? gy ?? 0;
  const ry = gy ?? gx ?? 0;
  return [Math.min(rx, w / 2), Math.min(ry, h / 2)];
}

/** Clockwise from the top edge: four lines and four KAPPA quarter-ellipses, like the circle's arcs. */
function roundedRectOutline(box: { x: number; y: number; w: number; h: number }, rx: number, ry: number): Outline {
  const { x, y } = box;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const r = x + box.w;
  const b = y + box.h;
  return { ops: [
    mv(x + rx, y),
    ln(r - rx, y), cv([r - rx + kx, y], [r, y + ry - ky], [r, y + ry]),
    ln(r, b - ry), cv([r, b - ry + ky], [r - rx + kx, b], [r - rx, b]),
    ln(x + rx, b), cv([x + rx - kx, b], [x, b - ry + ky], [x, b - ry]),
    ln(x, y + ry), cv([x, y + ry - ky], [x + rx - kx, y], [x + rx, y]),
    { op: "Z" },
  ] };
}

/** Four cubics from (cx+rx, cy) clockwise; the circle is the rx = ry case. */
export function ellipseOutline(el: Element, rx: number, ry: number): Outline | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const cx = num(el.getAttribute("cx"));
  const cy = num(el.getAttribute("cy"));
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return { ops: [
    mv(cx + rx, cy),
    cv([cx + rx, cy + ky], [cx + kx, cy + ry], [cx, cy + ry]),
    cv([cx - kx, cy + ry], [cx - rx, cy + ky], [cx - rx, cy]),
    cv([cx - rx, cy - ky], [cx - kx, cy - ry], [cx, cy - ry]),
    cv([cx + kx, cy - ry], [cx + rx, cy - ky], [cx + rx, cy]),
    { op: "Z" },
  ] };
}

export function lineOutline(el: Element): Outline {
  return { ops: [
    mv(num(el.getAttribute("x1")), num(el.getAttribute("y1"))),
    ln(num(el.getAttribute("x2")), num(el.getAttribute("y2"))),
  ] };
}

export function pointsOutline(el: Element, closed: boolean): Outline | null {
  const raw = el.getAttribute("points");
  if (raw === null) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 4 || nums.length % 2 !== 0) return null;
  const ops: OutlineOp[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) ops.push(i === 0 ? mv(nums[i], nums[i + 1]) : ln(nums[i], nums[i + 1]));
  if (closed) ops.push({ op: "Z" });
  return { ops };
}
