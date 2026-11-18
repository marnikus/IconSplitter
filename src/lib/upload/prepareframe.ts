// prepareframe.ts — reading the source's own frame (viewBox or px size) and
// the AS-IS shortcut result (2026-11-17, split out of prepare.ts).
import { BACKGROUND_SOURCE } from "./settings";
import { fmt, parseSvgLength, type ArtboardFit } from "./geom";
import type { Bounds } from "./geom/bounds";
import type { PrepareResult } from "./preparetypes";

/** As is: the source text itself, framed by its own viewBox (or px size); null = no readable frame, so the pipeline decides. */
export function asIsPrepared(sourceSvg: string, root: Element | null): PrepareResult | null {
  if (root === null || name(root) !== "svg") return null;
  const frame = viewBoxOf(root) ?? sizeOf(root);
  if (frame === null) return null;
  const fit: ArtboardFit = {
    viewBox: `${fmt(frame.minX)} ${fmt(frame.minY)} ${fmt(frame.width)} ${fmt(frame.height)}`,
    artW: frame.width, artH: frame.height, offsetX: -frame.minX, offsetY: -frame.minY, pad: 0, scale: 1,
  };
  return {
    ok: true, svg: sourceSvg, fit, bounds: frame, background: BACKGROUND_SOURCE, globalStroke: { stroke: null, strokeWidth: null }, passes: 0,
    shapesBaked: 0, strokesNormalized: 0, strokesRecolored: 0, strokesExpanded: 0, asIs: true,
  };
}

/** The root's viewBox as bounds; null when absent or degenerate. */
export function viewBoxOf(root: Element): Bounds | null {
  const n = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null;
  return { minX: n[0], minY: n[1], width: n[2], height: n[3] };
}

/** A root with only a px width/height: the frame at the origin. */
export function sizeOf(root: Element): Bounds | null {
  const w = parseSvgLength(root.getAttribute("width"));
  const h = parseSvgLength(root.getAttribute("height"));
  return w !== null && h !== null && w > 0 && h > 0 ? { minX: 0, minY: 0, width: w, height: h } : null;
}


export function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
