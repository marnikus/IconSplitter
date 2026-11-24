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

export type RescaleDomResult = { ok: true; factor: number } | { ok: false; reason: string };

function hasOwnStrokeWidth(el: Element): boolean {
  if (num(el.getAttribute("stroke-width")) !== null) return true;
  const style = el.getAttribute("style");
  return style !== null && /stroke-width\s*:/i.test(style);
}

/** Single top-down pass to materialise implicit SVG default `stroke-width="1"` before proportional scaling. */
function walkImplicitStrokes(el: Element, inheritedStroke: string, inheritedWidth: boolean): void {
  const own = ownStroke(el);
  const stroke = own ?? inheritedStroke;
  let hasWidth = inheritedWidth || hasOwnStrokeWidth(el);
  if (stroke !== "none" && !hasWidth) {
    el.setAttribute("stroke-width", "1");
    hasWidth = true;
  }
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
    walkImplicitStrokes(child, stroke, hasWidth);
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

/** Computes the target rescale factor for `root`, or null if `root` lacks usable dimensions. */
export function rescaleFactorOf(root: Element, megapixels: number): number | null {
  if (root.nodeName.toLowerCase() !== "svg") return null;
  const base = baseSizeOf(root);
  return base === null ? null : rescaleSize(base.width, base.height, megapixels).factor;
}

/** Rescales `root` in place to target megapixels (RULE 26 direct coordinates). */
export function rescaleSvgDom(root: Element, o: RescaleOptions, skipElements?: ReadonlySet<Element>): RescaleDomResult {
  if (root.nodeName.toLowerCase() !== "svg") return { ok: false, reason: "the document root is not an <svg> element" };
  const base = baseSizeOf(root);
  if (base === null) return { ok: false, reason: "the document has no readable px size or viewBox to rescale" };
  const vb = viewBoxOf(root) ?? [0, 0, base.width, base.height];
  const { width, height, factor } = rescaleSize(base.width, base.height, o.rescaleMegapixels);
  if (o.rescaleStrokes) walkImplicitStrokes(root, "none", false);
  bakeDirectSvg(root, { scale: factor, scaleStrokes: o.rescaleStrokes, skipElements });
  root.setAttribute("viewBox", `${fmt1(vb[0] * factor)} ${fmt1(vb[1] * factor)} ${fmt1(vb[2] * factor, 0.1)} ${fmt1(vb[3] * factor, 0.1)}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { ok: true, factor };
}

export function rescaleSvg(svg: string, o: RescaleOptions): RescaleResult {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const res = rescaleSvgDom(root, o);
  if (!res.ok) return { ok: false, svg, reason: res.reason };
  return { ok: true, svg: new XMLSerializer().serializeToString(root), factor: res.factor };
}

/** EPS points per CSS px — what both EPS converters map a document's px size by. */
const PT_PER_PX = 0.75;

function scaleRootDimensionAttr(tag: string, name: "width" | "height"): string | null {
  const re = new RegExp(`(\\b${name}=["'])([^"']+)(["'])`);
  const m = re.exec(tag);
  const v = m === null ? null : num(m[2]);
  if (m === null || v === null) return null;
  return tag.replace(re, `$1${Number((v / PT_PER_PX).toFixed(3))}$3`);
}

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
  const openEnd = svg.indexOf(">");
  const openTag = openEnd > 0 ? svg.slice(0, openEnd + 1) : "";
  if (/^<svg\b/i.test(openTag.trimStart())) {
    const withW = scaleRootDimensionAttr(openTag, "width");
    const withWH = withW === null ? null : scaleRootDimensionAttr(withW, "height");
    if (withWH !== null) return withWH + svg.slice(openEnd + 1);
  }
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const w = num(root.getAttribute("width")), h = num(root.getAttribute("height"));
  if (root.nodeName.toLowerCase() !== "svg" || w === null || h === null) return svg;
  root.setAttribute("width", String(Number((w / PT_PER_PX).toFixed(3))));
  root.setAttribute("height", String(Number((h / PT_PER_PX).toFixed(3))));
  return new XMLSerializer().serializeToString(root);
}
