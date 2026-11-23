// rescale.ts — "rescale the full artboard keeping its ratio" (2026-11-17;
// updated 2026-11-19 for RULE 26 direct geometry): root `width`/`height`,
// `viewBox` and geometry rescale directly into target px rounded to ≤ 1 decimal
// place. With `rescaleStrokes` on, strokes scale by `factor`; with it off,
// `stroke-width` keeps its direct px value instead of dividing by `factor`.
import { rescaleSize, type ExportFormatOptions } from "../exportformats";
import { bakeDirectSvg, fmt1 } from "./svgdirect";

export type RescaleOptions = Pick<ExportFormatOptions, "rescaleMegapixels" | "rescaleStrokes">;
export type RescaleResult = { ok: true; svg: string; factor: number } | { ok: false; svg: string; reason: string };

const num = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number(value.trim().replace(/px$/i, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function ownStroke(el: Element): string | null {
  const value = el.getAttribute("stroke");
  return value === null ? null : value.trim().toLowerCase();
}

function effectiveStroke(el: Element): string {
  let cur: Element | null = el;
  while (cur !== null) {
    const own = ownStroke(cur);
    if (own !== null) return own;
    cur = cur.parentElement;
  }
  return "none";
}

function hasInheritedStrokeWidth(el: Element): boolean {
  let cur: Element | null = el;
  while (cur !== null) {
    if (num(cur.getAttribute("stroke-width")) !== null) return true;
    const style = cur.getAttribute("style");
    if (style && /stroke-width\s*:/i.test(style)) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Materialise implicit SVG default `stroke-width="1"` before proportional scaling. */
function seedImplicitStrokes(root: Element): void {
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (effectiveStroke(el) !== "none" && !hasInheritedStrokeWidth(el)) {
      el.setAttribute("stroke-width", "1");
    }
  }
}

function viewBoxOf(root: Element): [number, number, number, number] | null {
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0) {
    return [vb[0], vb[1], vb[2], vb[3]];
  }
  return null;
}

function baseSizeOf(root: Element): { width: number; height: number } | null {
  const pxW = num(root.getAttribute("width")), pxH = num(root.getAttribute("height"));
  if (pxW !== null && pxH !== null) return { width: pxW, height: pxH };
  const vb = viewBoxOf(root);
  return vb === null ? null : { width: vb[2], height: vb[3] };
}

export function rescaleSvg(svg: string, o: RescaleOptions): RescaleResult {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root.nodeName.toLowerCase() !== "svg") return { ok: false, svg, reason: "the document root is not an <svg> element" };
  const base = baseSizeOf(root);
  if (base === null) return { ok: false, svg, reason: "the document has no readable px size or viewBox to rescale" };
  const vb = viewBoxOf(root) ?? [0, 0, base.width, base.height];
  const { width, height, factor } = rescaleSize(base.width, base.height, o.rescaleMegapixels);
  if (o.rescaleStrokes) seedImplicitStrokes(root);
  bakeDirectSvg(root, { scale: factor, scaleStrokes: o.rescaleStrokes });
  root.setAttribute("viewBox", `${fmt1(vb[0] * factor)} ${fmt1(vb[1] * factor)} ${fmt1(vb[2] * factor, 0.1)} ${fmt1(vb[3] * factor, 0.1)}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { ok: true, svg: new XMLSerializer().serializeToString(root), factor };
}

/** EPS points per CSS px — what both EPS converters map a document's px size by. */
const PT_PER_PX = 0.75;

/**
 * The document an EPS converter gets (2026-11-23). An EPS page is measured in
 * points, and Illustrator and the stock sites count one point as one px — so
 * after "Rescale artboard to MP" the page must be the rescale target in POINTS.
 * Both converters map px to pt by 0.75 (the built-in writer and Inkscape), so
 * the root's px size is handed over × 4/3; the viewBox and drawing stay. Without
 * a rescale the document goes as it is.
 */
export function epsInputSvg(svg: string, rescaled: boolean): string {
  if (!rescaled) return svg;
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const w = num(root.getAttribute("width")), h = num(root.getAttribute("height"));
  if (root.nodeName.toLowerCase() !== "svg" || w === null || h === null) return svg;
  root.setAttribute("width", String(Number((w / PT_PER_PX).toFixed(3))));
  root.setAttribute("height", String(Number((h / PT_PER_PX).toFixed(3))));
  return new XMLSerializer().serializeToString(root);
}
