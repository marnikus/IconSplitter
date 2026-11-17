// svganchors.ts — the anchor points (nodes) of an SVG drawing (2026-11-05), for
// the Ctrl-hover overlay on the preview. A node is where a segment ENDS, read
// straight from the path grammar (the shared tokenizer, geom/path), so an arc
// is one node — not the ≤90° pieces the exporter's outline model splits it
// into. Basic shapes give their corners / quarter points; every group and
// element transform is applied, so the points sit in the root SVG's own space.
// Pure: markup in, points out.

import { identity, applyM, multiply, parseTransform, type Matrix } from "./upload/geom/matrix";
import { tokenizePath } from "./upload/geom/path";

export interface AnchorPoint { x: number; y: number }

export interface Anchors {
  points: AnchorPoint[];
  /** The larger viewBox side, so the overlay can size its circles; null when unknown. */
  size: number | null;
}

/** Elements whose content is never drawn where it stands. */
const NOT_DRAWN = new Set(["defs", "clippath", "mask", "symbol", "marker", "pattern", "lineargradient", "radialgradient", "filter", "title", "desc", "metadata"]);

const ARITY_END: Record<string, number> = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7 };

/** One node per segment end; H/V move one axis; Z returns to the subpath start. */
export function pathAnchors(d: string | null): AnchorPoint[] {
  if (d === null || d.trim() === "") return [];
  const out: AnchorPoint[] = [];
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  for (const { cmd, nums } of tokenizePath(d)) {
    const upper = cmd.toUpperCase();
    if (upper === "Z") { cur = start; continue; }
    const next = endOf(upper, cmd !== upper, nums, cur);
    if (next === null) continue;
    if (upper === "M") start = next;
    // A segment that lands back on its subpath's first node adds no new node.
    else if (same(next, start)) { cur = next; continue; }
    out.push(next);
    cur = next;
  }
  return out;
}

const same = (a: AnchorPoint, b: AnchorPoint): boolean => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** Where one command's segment ends; null for a malformed one. */
function endOf(upper: string, relative: boolean, nums: number[], cur: AnchorPoint): AnchorPoint | null {
  if (upper === "H") return { x: relative ? cur.x + nums[0] : nums[0], y: cur.y };
  if (upper === "V") return { x: cur.x, y: relative ? cur.y + nums[0] : nums[0] };
  const n = ARITY_END[upper];
  if (n === undefined || nums.length < n) return null;
  const [x, y] = [nums[n - 2], nums[n - 1]];
  return relative ? { x: cur.x + x, y: cur.y + y } : { x, y };
}

const num = (el: Element, name: string): number => Number(el.getAttribute(name) ?? 0) || 0;

/** The nodes of one basic shape or path, in its own user space. */
function shapeAnchors(el: Element): AnchorPoint[] {
  switch (el.localName.toLowerCase()) {
    case "path": return pathAnchors(el.getAttribute("d"));
    case "line": return [{ x: num(el, "x1"), y: num(el, "y1") }, { x: num(el, "x2"), y: num(el, "y2") }];
    case "polyline": case "polygon": return pointsOf(el.getAttribute("points"));
    case "rect": return rectCorners(el);
    case "circle": return quarterPoints(num(el, "cx"), num(el, "cy"), num(el, "r"), num(el, "r"));
    case "ellipse": return quarterPoints(num(el, "cx"), num(el, "cy"), num(el, "rx"), num(el, "ry"));
    default: return [];
  }
}

function pointsOf(raw: string | null): AnchorPoint[] {
  const n = (raw ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const out: AnchorPoint[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

function rectCorners(el: Element): AnchorPoint[] {
  const [x, y, w, h] = [num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height")];
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

function quarterPoints(cx: number, cy: number, rx: number, ry: number): AnchorPoint[] {
  return [{ x: cx + rx, y: cy }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy }, { x: cx, y: cy - ry }];
}

/** Every drawn element's nodes, through the transforms of its ancestors. */
function collect(el: Element, ctm: Matrix, out: AnchorPoint[]): void {
  for (const child of Array.from(el.children)) {
    if (NOT_DRAWN.has(child.localName.toLowerCase())) continue;
    const m = multiply(ctm, parseTransform(child.getAttribute("transform")));
    for (const p of shapeAnchors(child)) {
      const [x, y] = applyM(m, p.x, p.y);
      out.push({ x, y });
    }
    collect(child, m, out);
  }
}

function sizeOf(root: Element): number | null {
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite)) return Math.max(box[2], box[3]);
  const w = Number.parseFloat(root.getAttribute("width") ?? "");
  const h = Number.parseFloat(root.getAttribute("height") ?? "");
  return Number.isFinite(w) && Number.isFinite(h) ? Math.max(w, h) : null;
}

/** The drawing's nodes in the root SVG's user space; none for code that does not parse. */
export function anchorPointsOf(markup: string): Anchors {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0 || root.localName !== "svg") return { points: [], size: null };
  const points: AnchorPoint[] = [];
  collect(root, identity(), points);
  return { points, size: sizeOf(root) };
}
