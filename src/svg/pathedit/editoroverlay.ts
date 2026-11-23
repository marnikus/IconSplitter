// editoroverlay.ts — incremental pooled SVG overlay for the path editor.
// Preserves exact DOM hierarchy & z-order under `[data-edit-overlay]` while
// reusing anchor `<circle>` elements in-place and skipping unchanged layers so
// dragging 1 anchor on a 240-anchor icon mutates 1 `<circle>` instead of
// destroying and recreating hundreds of SVG nodes per frame.

import type { EditorState } from "../../lib/pathedit/gesture";
import { editableSub } from "../../lib/pathedit/session";
import { toPathData, type AnchorRef, type PathModel } from "../../lib/pathedit/model";
import {
  createScaleBoxPool, cutHintMarks, cutRegionMarks, handlesOf, marqueeBox, n, scaleBoxKeyOf,
  skewMarks, snapMarks, STYLE_ANCHOR, STYLE_ANCHOR_SEL, STYLE_GUIDE, SVG_NS, updateScaleBoxPool,
  type OverlayLook, type ScaleBoxPool,
} from "./overlaymarks";

export type { OverlayLook } from "./overlaymarks";
export const OVERLAY_ATTR = "data-edit-overlay";

interface CircleSlot {
  el: Element;
  x: number;
  y: number;
  r: string;
  sel: boolean;
}

interface OverlayPool {
  root: Element;
  guideLayer: Element;
  underLayer: Element;
  anchorLayer: Element;
  handleLayer: Element;
  scaleLayer: Element;
  topLayer: Element;
  circles: CircleSlot[];
  scalePool: ScaleBoxPool | null;
  guideModel: PathModel | null;
  guideObjects: readonly number[] | null;
  guideOn: boolean | null;
  underKey: string;
  cutRegion: EditorState["cutRegionHint"];
  snap: EditorState["snap"];
  cutHint: EditorState["cutHint"];
  anchorModel: PathModel | null;
  anchorObjects: readonly number[] | null;
  anchorSel: readonly AnchorRef[] | null;
  anchorRadius: string;
  handleModel: PathModel | null;
  handleObjects: readonly number[] | null;
  handleSel: readonly AnchorRef[] | null;
  handleScale: string;
  topMarquee: EditorState["marquee"];
  topSkew: EditorState["skewHint"];
  topBoxKey: string;
}

const pools = new WeakMap<Element, OverlayPool>();

function createPool(svg: Element): OverlayPool {
  const doc = svg.ownerDocument;
  const root = doc.createElementNS(SVG_NS, "g");
  root.setAttribute(OVERLAY_ATTR, "");
  root.setAttribute("pointer-events", "none");
  const mk = () => doc.createElementNS(SVG_NS, "g");
  const [guideLayer, underLayer, anchorLayer, handleLayer, scaleLayer, topLayer] = [mk(), mk(), mk(), mk(), mk(), mk()];
  root.append(guideLayer, underLayer, anchorLayer, handleLayer, scaleLayer, topLayer);
  svg.appendChild(root);
  const pool: OverlayPool = {
    root, guideLayer, underLayer, anchorLayer, handleLayer, scaleLayer, topLayer, circles: [], scalePool: null,
    guideModel: null, guideObjects: null, guideOn: null,
    underKey: "", cutRegion: undefined, snap: null, cutHint: undefined,
    anchorModel: null, anchorObjects: null, anchorSel: null, anchorRadius: "",
    handleModel: null, handleObjects: null, handleSel: null, handleScale: "",
    topMarquee: null, topSkew: undefined, topBoxKey: "__init__",
  };
  pools.set(svg, pool);
  return pool;
}

function acquirePool(svg: Element): OverlayPool {
  const existing = pools.get(svg);
  if (existing !== undefined && existing.root.parentNode === svg) {
    if (svg.lastElementChild !== existing.root) svg.appendChild(existing.root);
    return existing;
  }
  clearEditOverlay(svg);
  return createPool(svg);
}

function replaceChildren(layer: Element, nodes: readonly Element[]): void {
  while (layer.firstChild !== null) layer.removeChild(layer.firstChild);
  for (const child of nodes) layer.appendChild(child);
}

function syncGuide(doc: Document, pool: OverlayPool, st: EditorState, guideOn: boolean): void {
  if (pool.guideModel === st.session.model && pool.guideObjects === st.session.objects && pool.guideOn === guideOn) return;
  pool.guideModel = st.session.model;
  pool.guideObjects = st.session.objects;
  pool.guideOn = guideOn;
  if (!guideOn) { replaceChildren(pool.guideLayer, []); return; }
  const model = { subs: st.session.model.subs.map((s, i) => (editableSub(st.session, i) ? s : { ...s, anchors: [] })) };
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", toPathData(model, 3));
  path.setAttribute("style", STYLE_GUIDE);
  replaceChildren(pool.guideLayer, [path]);
}

function syncUnder(doc: Document, pool: OverlayPool, st: EditorState, look: OverlayLook): void {
  const key = `${look.u}:${look.anchorPx}`;
  if (pool.underKey === key && pool.cutRegion === st.cutRegionHint && pool.snap === st.snap && pool.cutHint === st.cutHint) return;
  pool.underKey = key;
  pool.cutRegion = st.cutRegionHint;
  pool.snap = st.snap;
  pool.cutHint = st.cutHint;
  replaceChildren(pool.underLayer, [...cutRegionMarks(doc, st), ...snapMarks(doc, st, look), ...cutHintMarks(doc, st)]);
}

type CircleSpec = Omit<CircleSlot, "el">;

function updateCircleSlot(slot: CircleSlot, s: CircleSpec): void {
  if (slot.x !== s.x) { slot.x = s.x; slot.el.setAttribute("cx", n(s.x)); }
  if (slot.y !== s.y) { slot.y = s.y; slot.el.setAttribute("cy", n(s.y)); }
  if (slot.r !== s.r) { slot.r = s.r; slot.el.setAttribute("r", s.r); }
  if (slot.sel !== s.sel) { slot.sel = s.sel; slot.el.setAttribute("style", s.sel ? STYLE_ANCHOR_SEL : STYLE_ANCHOR); }
}

function putCircleAt(doc: Document, pool: OverlayPool, count: number, spec: CircleSpec): void {
  if (count < pool.circles.length) {
    updateCircleSlot(pool.circles[count], spec);
    return;
  }
  const el = doc.createElementNS(SVG_NS, "circle");
  el.setAttribute("cx", n(spec.x));
  el.setAttribute("cy", n(spec.y));
  el.setAttribute("r", spec.r);
  el.setAttribute("style", spec.sel ? STYLE_ANCHOR_SEL : STYLE_ANCHOR);
  pool.anchorLayer.appendChild(el);
  pool.circles.push({ el, ...spec });
}

function drawEditableCircles(doc: Document, pool: OverlayPool, s: EditorState["session"], r: string): number {
  const selected = s.selection.length === 0 ? null : new Set(s.selection.map((ref) => `${ref.sub}:${ref.i}`));
  let count = 0;
  for (let sub = 0; sub < s.model.subs.length; sub++) {
    if (!editableSub(s, sub)) continue;
    const anchors = s.model.subs[sub].anchors;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      putCircleAt(doc, pool, count, { x: a.x, y: a.y, r, sel: selected !== null && selected.has(`${sub}:${i}`) });
      count += 1;
    }
  }
  return count;
}

function syncAnchors(doc: Document, pool: OverlayPool, st: EditorState, look: OverlayLook): void {
  const r = n((look.anchorPx / 2) * look.u);
  const s = st.session;
  if (pool.anchorModel === s.model && pool.anchorObjects === s.objects && pool.anchorSel === s.selection && pool.anchorRadius === r) return;
  pool.anchorModel = s.model;
  pool.anchorObjects = s.objects;
  pool.anchorSel = s.selection;
  pool.anchorRadius = r;
  const count = drawEditableCircles(doc, pool, s, r);
  while (pool.circles.length > count) pool.circles.pop()!.el.remove();
}

function syncHandles(doc: Document, pool: OverlayPool, st: EditorState, look: OverlayLook): void {
  const scale = `${look.u}:${look.anchorPx}`;
  const s = st.session;
  if (pool.handleModel === s.model && pool.handleObjects === s.objects && pool.handleSel === s.selection && pool.handleScale === scale) return;
  pool.handleModel = s.model;
  pool.handleObjects = s.objects;
  pool.handleSel = s.selection;
  pool.handleScale = scale;
  const nodes: Element[] = [];
  for (const ref of s.selection) {
    if (!editableSub(s, ref.sub)) continue;
    const a = s.model.subs[ref.sub]?.anchors[ref.i];
    if (a !== undefined) nodes.push(...handlesOf(doc, a, look));
  }
  replaceChildren(pool.handleLayer, nodes);
}

function syncTop(doc: Document, pool: OverlayPool, st: EditorState, look: OverlayLook): void {
  const boxKey = `${look.u}:${scaleBoxKeyOf(st)}`;
  if (pool.topBoxKey !== boxKey) {
    pool.topBoxKey = boxKey;
    if (boxKey.endsWith(":")) replaceChildren(pool.scaleLayer, []);
    else {
      pool.scalePool ??= createScaleBoxPool(doc);
      updateScaleBoxPool(pool.scalePool, st, look);
      if (pool.scalePool.group.parentNode !== pool.scaleLayer) replaceChildren(pool.scaleLayer, [pool.scalePool.group]);
    }
  }
  if (pool.topMarquee === st.marquee && pool.topSkew === st.skewHint) return;
  pool.topMarquee = st.marquee;
  pool.topSkew = st.skewHint;
  replaceChildren(pool.topLayer, [...marqueeBox(doc, st), ...skewMarks(doc, st, look)]);
}

/** Removes the previous overlay of this preview, if any. */
export function clearEditOverlay(root: ParentNode): void {
  root.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((g) => g.remove());
}

/** Draws (or incrementally updates) the overlay at the end of the icon's root <svg>. */
export function drawEditOverlay(svg: Element, st: EditorState, look: OverlayLook): void {
  const doc = svg.ownerDocument;
  const pool = acquirePool(svg);
  syncGuide(doc, pool, st, look.guide !== false);
  syncUnder(doc, pool, st, look);
  syncAnchors(doc, pool, st, look);
  syncHandles(doc, pool, st, look);
  syncTop(doc, pool, st, look);
}
