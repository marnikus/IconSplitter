// anchoroverlay.ts — Ctrl + hover on an SVG preview shows the drawing's anchor
// points (2026-11-05), like an editor's node view: small hollow circles at
// every node (lib/svganchors), drawn INSIDE the preview's own shadow SVG so
// they sit exactly on the artwork at any zoom. Let go of Ctrl or leave the
// preview and they are removed. Nothing is written to the file.

import { useEffect, useState } from "react";
import { anchorPointsOf, type Anchors } from "../lib/svganchors";
import { getEditSettings } from "./editsettings";
import { toPathSpace } from "./pathedit/useEditorInput";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Inline !important: beats the preview stroke sheet's `svg * { … !important }`. */
const DOT_STYLE = "fill:#fff !important;stroke:#1a8cff !important;stroke-width:1.2px !important;"
  + "vector-effect:non-scaling-stroke !important;opacity:1 !important";

/** True while the pointer is over `host` AND Ctrl is held. */
export function useCtrlHover(host: { current: HTMLElement | null }): boolean {
  const [over, setOver] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (node === null) return undefined;
    const enter = (e: PointerEvent) => { setOver(true); setCtrl(e.ctrlKey); };
    const leave = () => setOver(false);
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    return () => { node.removeEventListener("pointerenter", enter); node.removeEventListener("pointerleave", leave); };
  }, [host]);
  useEffect(() => {
    if (!over) return undefined;
    const key = (e: KeyboardEvent) => setCtrl(e.ctrlKey);
    const blur = () => setCtrl(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); window.removeEventListener("blur", blur); };
  }, [over]);
  return over && ctrl;
}

const round = (n: number): string => String(Math.round(n * 1000) / 1000);

/** The node circles, in the root SVG's user space, sized to the drawing. */
function drawAnchors(svg: SVGSVGElement, anchors: Anchors): Element {
  const g = svg.ownerDocument.createElementNS(SVG_NS, "g");
  g.setAttribute("data-anchor-overlay", "");
  g.setAttribute("pointer-events", "none");
  // Edit settings' anchor size in SCREEN px (2026-11-06); the old relative size without a screen matrix
  const u = toPathSpace(svg, 0, 0)?.unitsPerPx ?? null;
  const r = round(u === null ? (anchors.size ?? 100) * 0.012 : (getEditSettings().anchorPx / 2) * u);
  for (const p of anchors.points) {
    const dot = svg.ownerDocument.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", round(p.x));
    dot.setAttribute("cy", round(p.y));
    dot.setAttribute("r", r);
    dot.setAttribute("style", DOT_STYLE);
    g.appendChild(dot);
  }
  svg.appendChild(g);
  return g;
}

/** Draws the anchors over the preview's shadow SVG while `show` holds. */
export function useAnchorOverlay(host: { current: HTMLElement | null }, html: string, show: boolean): void {
  useEffect(() => {
    const svg = host.current?.shadowRoot?.querySelector("svg") ?? null;
    if (!show || svg === null) return undefined;
    const overlay = drawAnchors(svg, anchorPointsOf(html));
    return () => overlay.remove();
  }, [host, html, show]);
}
