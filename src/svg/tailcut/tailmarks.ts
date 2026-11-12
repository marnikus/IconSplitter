// tailmarks.ts — the tail highlights on a preview (2026-11-06, redrawn 2026-11-09).
// Per tail: a small square on the open END of the line only, and the tail itself
// laid over its own line in the highlight colour from the end up to the crossing
// — exactly the part a cut removes. The square is N SCREEN pixels around the end
// (so it stays visible on a small thumbnail); the red line is as wide as the
// artwork's own line. Drawn inside the preview's shadow SVG only — never part of
// the art and never written to the file.

import { useEffect, type RefObject } from "react";
import type { Pt } from "../../lib/pathedit/model";
import { toPathSpace } from "../pathedit/useEditorInput";

/** One tail as the highlight needs it: its open end and the points from the end to the crossing. */
export interface TailMark { tip: Pt; path: readonly Pt[]; shape?: number }

export interface TailMarks { tails: readonly TailMark[]; color: string; paddingPx: number }

const SVG_NS = "http://www.w3.org/2000/svg";
const ATTR = "data-tail-mark";
/** The square reaches this far (screen px) beyond the padding setting, so a 0 padding still shows. */
const BASE_PX = 4;
/** The red line is never thinner than this on screen. */
const MIN_LINE_PX = 3;

const num = (v: number): string => String(Math.round(v * 1000) / 1000);
const important = (css: string): string => css.split(";").filter(Boolean).map((d) => `${d.trim()} !important`).join(";");

/** The artwork's own line width at a shape, in icon units (a screen-sized hairline is converted); null when unknown. */
function lineWidth(svg: SVGSVGElement, shape: number | undefined, u: number): number | null {
  const el = shape === undefined ? null : svg.querySelector(`[data-edit-path="${shape}"]`);
  if (el === null) return null;
  const style = svg.ownerDocument.defaultView?.getComputedStyle(el);
  const w = parseFloat(style?.strokeWidth ?? "");
  if (!(w > 0)) return null;
  return style?.getPropertyValue("vector-effect") === "non-scaling-stroke" ? w * u : w;
}

function node(svg: SVGSVGElement, tag: string, attrs: Record<string, string>, css: string): Element {
  const el = svg.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("style", important(css));
  return el;
}

/** The square on the open end. */
function endSquare(svg: SVGSVGElement, tip: Pt, half: number, color: string): Element {
  return node(svg, "rect", { x: num(tip.x - half), y: num(tip.y - half), width: num(2 * half), height: num(2 * half) },
    `fill:${color};fill-opacity:0.3;stroke:none;opacity:1`);
}

/** The tail laid over its own line, end → crossing. */
function tailLine(svg: SVGSVGElement, m: TailMark, look: { color: string; u: number }): Element {
  const d = m.path.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join("");
  const width = Math.max(lineWidth(svg, m.shape, look.u) ?? 0, MIN_LINE_PX * look.u);
  return node(svg, "path", { d },
    `fill:none;stroke:${look.color};stroke-width:${num(width)};stroke-linecap:round;stroke-linejoin:round;stroke-opacity:1;vector-effect:none;opacity:1`);
}

function drawMarks(svg: SVGSVGElement, marks: TailMarks): Element {
  const u = toPathSpace(svg, 0, 0)?.unitsPerPx ?? 1;
  const half = (marks.paddingPx + BASE_PX) * u;
  const g = svg.ownerDocument.createElementNS(SVG_NS, "g");
  g.setAttribute(ATTR, "");
  g.setAttribute("pointer-events", "none");
  for (const m of marks.tails) {
    g.appendChild(tailLine(svg, m, { color: marks.color, u }));
    g.appendChild(endSquare(svg, m.tip, half, marks.color));
  }
  svg.appendChild(g);
  return g;
}

/** Draws the marks over the preview's shadow SVG while there are any. */
export function useTailMarks(host: RefObject<HTMLElement | null>, html: string, marks: TailMarks | undefined): void {
  const key = marks === undefined ? "" : JSON.stringify(marks);
  useEffect(() => {
    const svg = host.current?.shadowRoot?.querySelector("svg") ?? null;
    if (svg === null || marks === undefined || marks.tails.length === 0) return undefined;
    const g = drawMarks(svg, marks);
    return () => g.remove();
    // `key` stands for `marks` (a fresh object each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, html, key]);
}
