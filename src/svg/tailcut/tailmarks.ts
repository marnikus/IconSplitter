// tailmarks.ts — the tail highlights on a row preview (2026-11-06): one box per
// detected tail, padded by N SCREEN pixels so it stays visible on a small
// thumbnail, in the chosen colour. Drawn inside the preview's shadow SVG only —
// never written to the file.

import { useEffect, type RefObject } from "react";
import type { TailBox } from "../../lib/tailcut";
import { toPathSpace } from "../pathedit/useEditorInput";

export interface TailMarks { boxes: readonly TailBox[]; color: string; paddingPx: number }

const SVG_NS = "http://www.w3.org/2000/svg";
const ATTR = "data-tail-mark";

function drawMarks(svg: SVGSVGElement, marks: TailMarks): Element {
  const u = toPathSpace(svg, 0, 0)?.unitsPerPx ?? 1;
  const pad = marks.paddingPx * u;
  const g = svg.ownerDocument.createElementNS(SVG_NS, "g");
  g.setAttribute(ATTR, "");
  g.setAttribute("pointer-events", "none");
  for (const b of marks.boxes) {
    const r = svg.ownerDocument.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(b.x - pad));
    r.setAttribute("y", String(b.y - pad));
    r.setAttribute("width", String(b.width + 2 * pad));
    r.setAttribute("height", String(b.height + 2 * pad));
    r.setAttribute("style", `fill:${marks.color} !important;fill-opacity:0.55 !important;stroke:none !important;opacity:1 !important`);
    g.appendChild(r);
  }
  svg.appendChild(g);
  return g;
}

/** Draws the marks over the preview's shadow SVG while there are any. */
export function useTailMarks(host: RefObject<HTMLElement | null>, html: string, marks: TailMarks | undefined): void {
  const key = marks === undefined ? "" : JSON.stringify(marks);
  useEffect(() => {
    const svg = host.current?.shadowRoot?.querySelector("svg") ?? null;
    if (svg === null || marks === undefined || marks.boxes.length === 0) return undefined;
    const g = drawMarks(svg, marks);
    return () => g.remove();
    // `key` stands for `marks` (a fresh object each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, html, key]);
}
