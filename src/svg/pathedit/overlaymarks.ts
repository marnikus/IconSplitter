// overlaymarks.ts — pure SVG element builders with pre-compiled !important CSS
// constants for the path editor's overlay layers (handles, snap, cut hints,
// marquee, scale/rotate box, and skew readout).
import type { EditorState } from "../../lib/pathedit/gesture";
import { HIT_PX, scaleBoxOf } from "../../lib/pathedit/gesture";
import { boxHandles, rotateHandleOf } from "../../lib/pathedit/scale";
import { nextIndex, segmentCubic, type Anchor, type Pt } from "../../lib/pathedit/model";

export const SVG_NS = "http://www.w3.org/2000/svg";
const BLUE = "#1a8cff";
const SNAP = "#ff5a36";

export interface OverlayLook {
  /** Path units per screen pixel. */
  u: number;
  /** The anchor's drawn diameter in screen pixels (Edit settings). */
  anchorPx: number;
  /** Thin guide along the working path (thin view only). */
  guide?: boolean;
}

const important = (css: string): string =>
  `${css.split(";").filter(Boolean).map((d) => `${d.trim()} !important`).join(";")};vector-effect:non-scaling-stroke !important;opacity:1 !important`;

export const STYLE_GUIDE = important("fill:none;stroke:#c8d2e0;stroke-width:1px");
export const STYLE_ANCHOR = important(`fill:#fff;stroke:${BLUE};stroke-width:1.4px`);
export const STYLE_ANCHOR_SEL = important(`fill:${BLUE};stroke:${BLUE};stroke-width:1.4px`);
const STYLE_HANDLE_ARM = important(`fill:none;stroke:${BLUE};stroke-width:1px`);
const STYLE_HANDLE_DIAMOND = important(`fill:#fff;stroke:${BLUE};stroke-width:1.2px`);
const STYLE_SNAP_END = important(`fill:none;stroke:${SNAP};stroke-width:2px`);
const STYLE_SNAP_SEG = important(`fill:none;stroke:${SNAP};stroke-width:1.5px`);
const STYLE_CUT_HINT = important("fill:none;stroke:#ff0000;stroke-width:4px;stroke-linecap:round;stroke-linejoin:round");
const STYLE_CUT_REGION = important("fill:rgba(255,0,0,0.22);stroke:#ff0000;stroke-width:2px;stroke-linejoin:round");
const STYLE_MARQUEE = important("fill:rgba(26,140,255,0.08);stroke:#1a8cff;stroke-width:1px;stroke-dasharray:4 3");
const STYLE_SCALE_BOX = important(`fill:none;stroke:${BLUE};stroke-width:1px;stroke-dasharray:5 3`);
const STYLE_SCALE_SQ = important(`fill:#fff;stroke:${BLUE};stroke-width:1.2px`);
const STYLE_ROTATE_KNOB = important(`fill:#fff;stroke:${BLUE};stroke-width:1.4px`);
const STYLE_SKEW_QUAD = important(`fill:rgba(26,140,255,0.06);stroke:${BLUE};stroke-width:1px;stroke-dasharray:5 3`);
const STYLE_SKEW_PIVOT = important(`fill:none;stroke:${BLUE};stroke-width:1.2px`);
const STYLE_SKEW_BACK = important("fill:#12182a;stroke:#35405e;stroke-width:1px");

export const n = (v: number): string => String(Math.round(v * 1000) / 1000);

function styledEl(doc: Document, tag: string, attrs: readonly [string, string][], styleText: string): Element {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of attrs) node.setAttribute(k, v);
  node.setAttribute("style", styleText);
  return node;
}

function diamond(doc: Document, p: Pt, r: number): Element {
  const pts = `${n(p.x)},${n(p.y - r)} ${n(p.x + r)},${n(p.y)} ${n(p.x)},${n(p.y + r)} ${n(p.x - r)},${n(p.y)}`;
  return styledEl(doc, "polygon", [["points", pts]], STYLE_HANDLE_DIAMOND);
}

/** One selected anchor's arms and diamonds. */
export function handlesOf(doc: Document, a: Anchor, look: OverlayLook): Element[] {
  const out: Element[] = [];
  const r = look.anchorPx * 0.4 * look.u;
  const ax = n(a.x), ay = n(a.y);
  for (const h of [a.in, a.out]) {
    if (h === null) continue;
    out.push(styledEl(doc, "line", [["x1", ax], ["y1", ay], ["x2", n(h.x)], ["y2", n(h.y)]], STYLE_HANDLE_ARM));
    out.push(diamond(doc, h, r));
  }
  return out;
}

/** The red snap mark: the target segment, plus a stronger ring on a line end. */
export function snapMarks(doc: Document, st: EditorState, look: OverlayLook): Element[] {
  const s = st.snap;
  if (s === null) return [];
  if (s.kind === "end") {
    return [styledEl(doc, "circle", [["cx", n(s.pt.x)], ["cy", n(s.pt.y)], ["r", n(look.anchorPx * look.u)]], STYLE_SNAP_END)];
  }
  const sub = st.drag !== null && "before" in st.drag ? st.drag.before.subs[s.sub] : st.session.model.subs[s.sub];
  const c = sub === undefined || nextIndex(sub, s.i) === null ? null : segmentCubic(sub, s.i);
  if (c === null) return [];
  const d = `M${n(c[0].x)} ${n(c[0].y)}C${n(c[1].x)} ${n(c[1].y)} ${n(c[2].x)} ${n(c[2].y)} ${n(c[3].x)} ${n(c[3].y)}`;
  return [styledEl(doc, "path", [["d", d]], STYLE_SNAP_SEG)];
}

function skewPivot(doc: Document, c: Pt, look: OverlayLook): Element {
  const g = doc.createElementNS(SVG_NS, "g");
  g.setAttribute("data-skew-pivot", "");
  const r = 5 * look.u, arm = 9 * look.u;
  g.appendChild(styledEl(doc, "circle", [["cx", n(c.x)], ["cy", n(c.y)], ["r", n(r)]], STYLE_SKEW_PIVOT));
  g.appendChild(styledEl(doc, "line", [["x1", n(c.x - arm)], ["y1", n(c.y)], ["x2", n(c.x + arm)], ["y2", n(c.y)]], STYLE_SKEW_PIVOT));
  g.appendChild(styledEl(doc, "line", [["x1", n(c.x)], ["y1", n(c.y - arm)], ["x2", n(c.x)], ["y2", n(c.y + arm)]], STYLE_SKEW_PIVOT));
  return g;
}

function skewReadout(doc: Document, angle: number, at: Pt, look: OverlayLook): Element[] {
  const u = look.u;
  const x = at.x + 14 * u, y = at.y + 14 * u;
  const textStyle = important(`fill:#fff;stroke:none;font-size:${n(11 * u)}px;font-family:sans-serif`);
  const text = styledEl(doc, "text", [["x", n(x + 7 * u)], ["y", n(y + 13 * u)], ["data-skew-readout", ""]], textStyle);
  text.textContent = `⊿ : ${(Math.round(angle * 10) / 10 + 0).toFixed(1)}°`;
  const back = styledEl(doc, "rect", [["x", n(x)], ["y", n(y)], ["width", n(72 * u)], ["height", n(18 * u)], ["rx", n(3 * u)]], STYLE_SKEW_BACK);
  return [back, text];
}

export function skewMarks(doc: Document, st: EditorState, look: OverlayLook): Element[] {
  const h = st.skewHint;
  if (h == null) return [];
  const points = h.quad.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
  const quad = styledEl(doc, "polygon", [["points", points], ["data-skew-quad", ""]], STYLE_SKEW_QUAD);
  return [quad, skewPivot(doc, h.center, look), ...skewReadout(doc, h.angle, h.at, look)];
}

export function cutHintMarks(doc: Document, st: EditorState): Element[] {
  const pts = st.cutHint;
  if (pts == null || pts.length < 2) return [];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join("");
  return [styledEl(doc, "path", [["d", d], ["data-cut-hint", ""]], STYLE_CUT_HINT)];
}

export function cutRegionMarks(doc: Document, st: EditorState): Element[] {
  const pts = st.cutRegionHint;
  if (pts == null || pts.length < 3) return [];
  const d = `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join("")}Z`;
  return [styledEl(doc, "path", [["d", d], ["data-cut-region", ""]], STYLE_CUT_REGION)];
}

export function marqueeBox(doc: Document, st: EditorState): Element[] {
  const m = st.marquee;
  if (m === null) return [];
  const x = Math.min(m.a.x, m.b.x), y = Math.min(m.a.y, m.b.y);
  return [styledEl(doc, "rect", [["x", n(x)], ["y", n(y)], ["width", n(Math.abs(m.a.x - m.b.x))], ["height", n(Math.abs(m.a.y - m.b.y))]], STYLE_MARQUEE)];
}

export function scaleBoxKeyOf(st: EditorState): string {
  const box = scaleBoxOf(st.session);
  return box === null ? "" : `${n(box.x0)}:${n(box.y0)}:${n(box.x1)}:${n(box.y1)}`;
}

export interface ScaleBoxPool {
  group: Element;
  rect: Element;
  handles: Element[];
  stem: Element;
  circle: Element;
}

export function createScaleBoxPool(doc: Document): ScaleBoxPool {
  const group = doc.createElementNS(SVG_NS, "g");
  const rect = styledEl(doc, "rect", [["data-scale-box", ""]], STYLE_SCALE_BOX);
  const ids = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handles = ids.map((id) => styledEl(doc, "rect", [["data-scale-handle", id]], STYLE_SCALE_SQ));
  const stem = styledEl(doc, "line", [["data-rotate-stem", ""]], STYLE_HANDLE_ARM);
  const circle = styledEl(doc, "circle", [["data-rotate-handle", ""]], STYLE_ROTATE_KNOB);
  group.append(rect, ...handles, stem, circle);
  return { group, rect, handles, stem, circle };
}

export function updateScaleBoxPool(pool: ScaleBoxPool, st: EditorState, look: OverlayLook): boolean {
  const box = scaleBoxOf(st.session);
  if (box === null) return false;
  const pad = HIT_PX.scalePad * look.u;
  pool.rect.setAttribute("x", n(box.x0 - pad));
  pool.rect.setAttribute("y", n(box.y0 - pad));
  pool.rect.setAttribute("width", n(box.x1 - box.x0 + 2 * pad));
  pool.rect.setAttribute("height", n(box.y1 - box.y0 + 2 * pad));
  const s = 3.5 * look.u;
  const w = n(2 * s);
  const hs = boxHandles(box, pad);
  for (let i = 0; i < hs.length; i++) {
    const el = pool.handles[i];
    el.setAttribute("x", n(hs[i].p.x - s));
    el.setAttribute("y", n(hs[i].p.y - s));
    el.setAttribute("width", w);
    el.setAttribute("height", w);
  }
  const knob = rotateHandleOf(box, pad, HIT_PX.rotateStem * look.u);
  const kx = n(knob.x), ky = n(knob.y);
  pool.stem.setAttribute("x1", kx);
  pool.stem.setAttribute("y1", n(box.y0 - pad));
  pool.stem.setAttribute("x2", kx);
  pool.stem.setAttribute("y2", ky);
  pool.circle.setAttribute("cx", kx);
  pool.circle.setAttribute("cy", ky);
  pool.circle.setAttribute("r", n(4.5 * look.u));
  return true;
}
