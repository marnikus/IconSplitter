// editoroverlay.ts — what the path editor draws over the icon (2026-11-06):
// a thin guide along the working path, EVERY anchor (blue circles, the selected
// ones filled), and only for the selection its handle arms and diamonds. A
// Shift-snap target is shown in red: the segment, or a ring on a line end. The
// marquee is a dashed box. Only the SELECTED paths show anchors (2026-11-06:
// several paths per session). Everything is drawn at the end of the icon's root
// <svg>, in its root space, and sized in SCREEN pixels: the path zooms, the chrome does not. Inline !important beats the
// preview stroke sheet. Nothing here is ever written to the file.

import type { EditorState } from "../../lib/pathedit/gesture";
import { editableSub } from "../../lib/pathedit/session";
import { HIT_PX, scaleBoxOf } from "../../lib/pathedit/gesture";
import { boxHandles } from "../../lib/pathedit/scale";
import { nextIndex, segmentCubic, toPathData, type Anchor, type Pt } from "../../lib/pathedit/model";

const SVG_NS = "http://www.w3.org/2000/svg";
export const OVERLAY_ATTR = "data-edit-overlay";
const BLUE = "#1a8cff";
const SNAP = "#ff5a36";

export interface OverlayLook {
  /** Path units per screen pixel. */
  u: number;
  /** The anchor's drawn diameter in screen pixels (Edit settings). */
  anchorPx: number;
  /** The thin guide along the working path: only in the thin view — over the preset stroke it doubled the line. */
  guide?: boolean;
}

const style = (css: string): string => css.split(";").filter(Boolean).map((d) => `${d.trim()} !important`).join(";")
  + ";vector-effect:non-scaling-stroke !important;opacity:1 !important";

function el(doc: Document, tag: string, attrs: Record<string, string>, css: string): Element {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.setAttribute("style", style(css));
  return node;
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

function diamond(doc: Document, p: Pt, r: number): Element {
  const pts = [[p.x, p.y - r], [p.x + r, p.y], [p.x, p.y + r], [p.x - r, p.y]].map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
  return el(doc, "polygon", { points: pts }, `fill:#fff;stroke:${BLUE};stroke-width:1.2px`);
}

/** One selected anchor's arms and diamonds. */
function handlesOf(doc: Document, a: Anchor, look: OverlayLook): Element[] {
  const out: Element[] = [];
  for (const h of [a.in, a.out]) {
    if (h === null) continue;
    out.push(el(doc, "line", { x1: n(a.x), y1: n(a.y), x2: n(h.x), y2: n(h.y) }, `fill:none;stroke:${BLUE};stroke-width:1px`));
    out.push(diamond(doc, h, (look.anchorPx * 0.4) * look.u));
  }
  return out;
}

function anchorDot(doc: Document, a: Anchor, selected: boolean, look: OverlayLook): Element {
  return el(doc, "circle", { cx: n(a.x), cy: n(a.y), r: n((look.anchorPx / 2) * look.u) },
    `fill:${selected ? BLUE : "#fff"};stroke:${BLUE};stroke-width:1.4px`);
}

/** The red snap mark: the target segment, plus a stronger ring on a line end. */
function snapMarks(doc: Document, st: EditorState, look: OverlayLook): Element[] {
  const s = st.snap;
  if (s === null) return [];
  if (s.kind === "end") return [el(doc, "circle", { cx: n(s.pt.x), cy: n(s.pt.y), r: n(look.anchorPx * look.u) }, `fill:none;stroke:${SNAP};stroke-width:2px`)];
  const sub = st.drag !== null && "before" in st.drag ? st.drag.before.subs[s.sub] : st.session.model.subs[s.sub];
  const c = sub === undefined || nextIndex(sub, s.i) === null ? null : segmentCubic(sub, s.i);
  if (c === null) return [];
  const d = `M${n(c[0].x)} ${n(c[0].y)}C${n(c[1].x)} ${n(c[1].y)} ${n(c[2].x)} ${n(c[2].y)} ${n(c[3].x)} ${n(c[3].y)}`;
  return [el(doc, "path", { d }, `fill:none;stroke:${SNAP};stroke-width:1.5px`)];
}

function marqueeBox(doc: Document, st: EditorState): Element[] {
  const m = st.marquee;
  if (m === null) return [];
  const x = Math.min(m.a.x, m.b.x), y = Math.min(m.a.y, m.b.y);
  return [el(doc, "rect", { x: n(x), y: n(y), width: n(Math.abs(m.a.x - m.b.x)), height: n(Math.abs(m.a.y - m.b.y)) },
    `fill:rgba(26,140,255,0.08);stroke:${BLUE};stroke-width:1px;stroke-dasharray:4 3`)];
}

/** The scale box around two or more selected anchors and its eight square handles (screen-sized). */
function scaleBoxMarks(doc: Document, st: EditorState, look: OverlayLook): Element[] {
  const box = scaleBoxOf(st.session);
  if (box === null) return [];
  const pad = HIT_PX.scalePad * look.u;
  const rect = el(doc, "rect", { x: n(box.x0 - pad), y: n(box.y0 - pad), width: n(box.x1 - box.x0 + 2 * pad), height: n(box.y1 - box.y0 + 2 * pad) },
    `fill:none;stroke:${BLUE};stroke-width:1px;stroke-dasharray:5 3`);
  rect.setAttribute("data-scale-box", "");
  const s = 3.5 * look.u;
  const handles = boxHandles(box, pad).map((h) => {
    const sq = el(doc, "rect", { x: n(h.p.x - s), y: n(h.p.y - s), width: n(2 * s), height: n(2 * s) }, `fill:#fff;stroke:${BLUE};stroke-width:1.2px`);
    sq.setAttribute("data-scale-handle", h.id);
    return sq;
  });
  return [rect, ...handles];
}

/** Removes the previous overlay of this preview, if any. */
export function clearEditOverlay(root: ParentNode): void {
  root.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((g) => g.remove());
}

/** Draws the whole overlay at the end of the icon's root <svg> (root space). */
export function drawEditOverlay(svg: Element, st: EditorState, look: OverlayLook): void {
  const doc = svg.ownerDocument;
  clearEditOverlay(svg);
  const g = doc.createElementNS(SVG_NS, "g");
  g.setAttribute(OVERLAY_ATTR, "");
  g.setAttribute("pointer-events", "none");
  const model = { subs: st.session.model.subs.map((s, i) => (editableSub(st.session, i) ? s : { ...s, anchors: [] })) };
  const selected = new Set(st.session.selection.map((r) => `${r.sub}:${r.i}`));
  const guide = look.guide === false ? [] : [el(doc, "path", { d: toPathData(model, 3) }, "fill:none;stroke:#c8d2e0;stroke-width:1px")];
  const parts: Element[] = [...guide, ...snapMarks(doc, st, look)];
  // anchors first; a selected point's handles above them
  model.subs.forEach((s, sub) => s.anchors.forEach((a, i) => parts.push(anchorDot(doc, a, selected.has(`${sub}:${i}`), look))));
  model.subs.forEach((s, sub) => s.anchors.forEach((a, i) => { if (selected.has(`${sub}:${i}`)) parts.push(...handlesOf(doc, a, look)); }));
  parts.push(...marqueeBox(doc, st), ...scaleBoxMarks(doc, st, look));
  for (const p of parts) g.appendChild(p);
  svg.appendChild(g);
}
