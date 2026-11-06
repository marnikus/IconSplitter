// model.ts — the point model of the in-preview SVG path editor (2026-11-06).
// An icon path is edited as ANCHORS, never as path text: each anchor has a
// position, an optional incoming and outgoing handle and a mode (corner /
// smooth / broken). Entering a session converts the path through the shared
// outline reader (lib/upload/geom/outline: every command, arcs included, as
// absolute M/L/C/Z); Finish writes M, L, C and Z back from the model, rounded
// to a fixed precision so undo diffs stay stable. Pure.

import { pathOutline } from "../upload/geom/outline";

export interface Pt { x: number; y: number }
export type PointMode = "corner" | "smooth" | "broken";

export interface Anchor {
  x: number;
  y: number;
  in: Pt | null;
  out: Pt | null;
  mode: PointMode;
}

export interface SubPath { anchors: Anchor[]; closed: boolean }
export interface PathModel { subs: SubPath[] }
/** One anchor: its subpath and its index there. */
export interface AnchorRef { sub: number; i: number }

const EPS = 1e-6;
const near = (a: Pt, b: Pt, eps = EPS): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

/** The mode a parsed anchor's handles describe: mirrored + same length = smooth. */
export function modeOf(a: Pick<Anchor, "x" | "y" | "in" | "out">): PointMode {
  if (a.in === null && a.out === null) return "corner";
  if (a.in === null || a.out === null) return "broken";
  const ix = a.in.x - a.x, iy = a.in.y - a.y, ox = a.out.x - a.x, oy = a.out.y - a.y;
  const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
  if (li < EPS || lo < EPS) return "broken";
  const opposite = Math.abs(ix * oy - iy * ox) <= 1e-3 * li * lo && ix * ox + iy * oy < 0;
  return opposite && Math.abs(li - lo) <= 1e-3 * Math.max(li, lo) ? "smooth" : "broken";
}

const corner = (x: number, y: number): Anchor => ({ x, y, in: null, out: null, mode: "corner" });
/** A control point that sits on its anchor is no handle at all. */
const handle = (c: Pt, at: Pt): Pt | null => (near(c, at) ? null : { x: c.x, y: c.y });

interface Reader { subs: SubPath[]; cur: SubPath | null }

/** A drawing command after Z without M starts a new subpath at the closed one's start. */
function openSub(r: Reader): SubPath {
  if (r.cur !== null && !r.cur.closed) return r.cur;
  const start = r.cur?.anchors[0] ?? corner(0, 0);
  r.cur = { anchors: [corner(start.x, start.y)], closed: false };
  r.subs.push(r.cur);
  return r.cur;
}

/** Z closes; a last anchor sitting on the first one merges into it (keeping its incoming handle). */
function closeSub(r: Reader): void {
  const sub = r.cur;
  if (sub === null) return;
  sub.closed = true;
  const first = sub.anchors[0];
  const last = sub.anchors[sub.anchors.length - 1];
  if (sub.anchors.length > 1 && near(first, last, 1e-4)) {
    first.in = last.in === null ? null : handle(last.in, first);
    sub.anchors.pop();
  }
}

/** Path data → anchors; an empty model when the path has no geometry. */
export function fromPathData(d: string | null): PathModel {
  const outline = pathOutline(d);
  const r: Reader = { subs: [], cur: null };
  for (const op of outline?.ops ?? []) {
    if (op.op === "M") { r.cur = { anchors: [corner(op.x, op.y)], closed: false }; r.subs.push(r.cur); continue; }
    if (op.op === "Z") { closeSub(r); continue; }
    const sub = openSub(r);
    const prev = sub.anchors[sub.anchors.length - 1];
    const next = corner(op.x, op.y);
    if (op.op === "C") {
      prev.out = handle({ x: op.x1, y: op.y1 }, prev);
      next.in = handle({ x: op.x2, y: op.y2 }, next);
    }
    sub.anchors.push(next);
  }
  for (const sub of r.subs) for (const a of sub.anchors) a.mode = modeOf(a);
  return { subs: r.subs };
}

/** Rounded to `digits` decimals, never "-0". */
function fmt(n: number, digits: number): string {
  const k = 10 ** digits;
  const v = Math.round(n * k) / k;
  return String(Object.is(v, -0) ? 0 : v);
}

const pair = (p: Pt, digits: number): string => `${fmt(p.x, digits)} ${fmt(p.y, digits)}`;

/** One segment a → b: a line only when neither side has a handle; a missing handle sits on its anchor. */
function segmentText(a: Anchor, b: Anchor, digits: number): string {
  if (a.out === null && b.in === null) return `L${pair(b, digits)}`;
  return `C${pair(a.out ?? a, digits)} ${pair(b.in ?? b, digits)} ${pair(b, digits)}`;
}

function subText(sub: SubPath, digits: number): string {
  const [first, ...rest] = sub.anchors;
  let text = `M${pair(first, digits)}`;
  let prev = first;
  for (const a of rest) { text += segmentText(prev, a, digits); prev = a; }
  if (!sub.closed) return text;
  const closing = sub.anchors.length > 1 && (prev.out !== null || first.in !== null);
  return `${text}${closing ? segmentText(prev, first, digits) : ""}Z`;
}

/** The model → path data with only M, L, C and Z, rounded to `digits` decimals. */
export function toPathData(model: PathModel, digits = 2): string {
  return model.subs.filter((s) => s.anchors.length > 0).map((s) => subText(s, digits)).join("");
}

/** The anchor after `i` in its subpath (wrapping on a closed one), or null at an open end. */
export function nextIndex(sub: SubPath, i: number): number | null {
  if (i + 1 < sub.anchors.length) return i + 1;
  return sub.closed && sub.anchors.length > 1 ? 0 : null;
}

/** The anchor before `i` (wrapping on a closed one), or null at an open start. */
export function prevIndex(sub: SubPath, i: number): number | null {
  if (i > 0) return i - 1;
  return sub.closed && sub.anchors.length > 1 ? sub.anchors.length - 1 : null;
}

/** Segment i → next(i) as a cubic [p0, c1, c2, p3]; a line has its controls on its ends. */
export function segmentCubic(sub: SubPath, i: number): [Pt, Pt, Pt, Pt] | null {
  const j = nextIndex(sub, i);
  if (j === null) return null;
  const a = sub.anchors[i];
  const b = sub.anchors[j];
  return [{ x: a.x, y: a.y }, a.out ?? { x: a.x, y: a.y }, b.in ?? { x: b.x, y: b.y }, { x: b.x, y: b.y }];
}

/** True when segment i has no handle on either side. */
export function isLineSegment(sub: SubPath, i: number): boolean {
  const j = nextIndex(sub, i);
  return j !== null && sub.anchors[i].out === null && sub.anchors[j].in === null;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The point at `t` on a cubic. */
export function cubicAt(c: readonly Pt[], t: number): Pt {
  const ab = lerp(c[0], c[1], t), bc = lerp(c[1], c[2], t), cd = lerp(c[2], c[3], t);
  return lerp(lerp(ab, bc, t), lerp(bc, cd, t), t);
}

/** De Casteljau split at `t`: [left cubic, right cubic], the same curve. */
export function splitCubic(c: readonly Pt[], t: number): [Pt[], Pt[]] {
  const ab = lerp(c[0], c[1], t), bc = lerp(c[1], c[2], t), cd = lerp(c[2], c[3], t);
  const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t);
  const mid = lerp(abc, bcd, t);
  return [[c[0], ab, abc, mid], [mid, bcd, cd, c[3]]];
}

/** A deep copy, so edits never touch a model another state still holds. */
export function cloneModel(m: PathModel): PathModel {
  return {
    subs: m.subs.map((s) => ({
      closed: s.closed,
      anchors: s.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } })),
    })),
  };
}
