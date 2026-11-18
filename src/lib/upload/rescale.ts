// rescale.ts — "rescale the full artboard keeping its ratio" (2026-11-17): the
// root px size moves to the megapixel target and the viewBox stays, so every
// coordinate scales with the document. With "scale strokes proportionally"
// unticked each visible stroke-width is divided by the factor FIRST — the
// stroke prints at the px it had before the rescale. A document with no
// readable px size or viewBox is refused by name, untouched (RULE 4/15).
import { rescaleSize, type ExportFormatOptions } from "../exportformats";

export type RescaleOptions = Pick<ExportFormatOptions, "rescaleMegapixels" | "rescaleStrokes">;
export type RescaleResult = { ok: true; svg: string; factor: number } | { ok: false; svg: string; reason: string };

const num = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number(value.trim().replace(/px$/i, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The element's own stroke paint; `null` = inherit, "none" = not stroked. */
function ownStroke(el: Element): string | null {
  const value = el.getAttribute("stroke");
  return value === null ? null : value.trim().toLowerCase();
}

/** The stroke paint that really reaches this element (nearest definition wins). */
function effectiveStroke(el: Element): string {
  let cur: Element | null = el;
  while (cur !== null) {
    const own = ownStroke(cur);
    if (own !== null) return own;
    cur = cur.parentElement;
  }
  return "none"; // SVG's default: nothing strokes unless something says so
}

function strokeWidthOf(el: Element): number {
  let cur: Element | null = el;
  while (cur !== null) {
    const own = num(cur.getAttribute("stroke-width"));
    if (own !== null) return own;
    cur = cur.parentElement;
  }
  return 1; // the SVG default width, in user units
}

/** Every visibly stroked element gets its own width divided by the factor. */
function divideStrokes(root: Element, factor: number): number {
  let touched = 0;
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (effectiveStroke(el) === "none") continue;
    const width = strokeWidthOf(el) / factor;
    el.setAttribute("stroke-width", String(Number(width.toFixed(4))));
    touched += 1;
  }
  return touched;
}

/** The root's own px size, else its viewBox; null when neither reads. */
function baseSizeOf(root: Element): { width: number; height: number } | null {
  const pxW = num(root.getAttribute("width")), pxH = num(root.getAttribute("height"));
  if (pxW !== null && pxH !== null) return { width: pxW, height: pxH };
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0 ? { width: vb[2], height: vb[3] } : null;
}

export function rescaleSvg(svg: string, o: RescaleOptions): RescaleResult {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root.nodeName.toLowerCase() !== "svg") return { ok: false, svg, reason: "the document root is not an <svg> element" };
  const base = baseSizeOf(root);
  if (base === null) return { ok: false, svg, reason: "the document has no readable px size or viewBox to rescale" };
  const { width, height, factor } = rescaleSize(base.width, base.height, o.rescaleMegapixels);
  if (!o.rescaleStrokes) divideStrokes(root, factor);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { ok: true, svg: new XMLSerializer().serializeToString(root), factor };
}
