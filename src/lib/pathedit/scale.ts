// scale.ts — scaling the selected anchors (2026-11-06). Two or more selected
// anchors get a bounding box with eight handles, drawn a little OUTSIDE the
// anchors so a handle never sits on one. A corner scales width and height
// freely; an edge scales one direction. Uniform (Shift) keeps the proportions:
// a corner takes the larger change for both axes, an edge applies its change to
// both (pivot: the middle of the opposite edge). The pivot is always the
// opposite side; anchors and their handles scale together. Pure.

import { cloneModel, type AnchorRef, type PathModel, type Pt } from "./model";

export interface Box { x0: number; y0: number; x1: number; y1: number }
export type BoxHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export interface BoxHandle { id: BoxHandleId; p: Pt }

/** The box of the selected anchors (their positions; handles do not widen it). */
export function selectionBox(m: PathModel, refs: readonly AnchorRef[]): Box | null {
  const pts = refs.map((r) => m.subs[r.sub]?.anchors[r.i]).filter((a): a is NonNullable<typeof a> => a !== undefined);
  if (pts.length === 0) return null;
  const xs = pts.map((a) => a.x), ys = pts.map((a) => a.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The eight handles of `box`, pushed `pad` outward. */
export function boxHandles(box: Box, pad: number): BoxHandle[] {
  const x0 = box.x0 - pad, y0 = box.y0 - pad, x1 = box.x1 + pad, y1 = box.y1 + pad;
  const mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2;
  return [
    { id: "nw", p: { x: x0, y: y0 } }, { id: "n", p: { x: mx, y: y0 } }, { id: "ne", p: { x: x1, y: y0 } },
    { id: "e", p: { x: x1, y: my } }, { id: "se", p: { x: x1, y: y1 } }, { id: "s", p: { x: mx, y: y1 } },
    { id: "sw", p: { x: x0, y: y1 } }, { id: "w", p: { x: x0, y: my } },
  ];
}

/** The handle under `p`, if any. */
export function handleAt(handles: readonly BoxHandle[], p: Pt, r: number): BoxHandleId | null {
  return handles.find((h) => Math.hypot(h.p.x - p.x, h.p.y - p.y) <= r)?.id ?? null;
}

interface Axis { origin: number; f: number; moves: boolean }

/** One axis: which side moves (`lo` / `hi`), the pivot (the other side) and the factor. */
function axis(lo: number, hi: number, d: number, side: "lo" | "hi" | null): Axis {
  const len = hi - lo;
  if (side === null || len === 0) return { origin: lo, f: 1, moves: false };
  return side === "hi" ? { origin: lo, f: (len + d) / len, moves: true } : { origin: hi, f: (len - d) / len, moves: true };
}

/** A scale: the pivot and the factor per axis. */
export interface ScaleSpec { origin: Pt; sx: number; sy: number }

/** Which side of each axis a handle moves. */
function sidesOf(id: BoxHandleId): { x: "lo" | "hi" | null; y: "lo" | "hi" | null } {
  const x = id.includes("e") ? "hi" : id.includes("w") ? "lo" : null;
  const y = id.includes("s") ? "hi" : id.includes("n") ? "lo" : null;
  return { x, y };
}

/** Shift: one factor for both axes — a corner takes the larger change, an edge pivots on the opposite edge's middle. */
function uniformOf(ax: Axis, ay: Axis, box: Box): ScaleSpec {
  if (ax.moves && ay.moves) {
    const f = Math.abs(ax.f - 1) >= Math.abs(ay.f - 1) ? ax.f : ay.f;
    return { origin: { x: ax.origin, y: ay.origin }, sx: f, sy: f };
  }
  const f = ax.moves ? ax.f : ay.f;
  return { origin: { x: ax.moves ? ax.origin : (box.x0 + box.x1) / 2, y: ay.moves ? ay.origin : (box.y0 + box.y1) / 2 }, sx: f, sy: f };
}

/** The pivot and factors a handle dragged by (dx, dy) asks for. */
export function scaleFor(id: BoxHandleId, box: Box, d: { dx: number; dy: number }, uniform: boolean): ScaleSpec {
  const side = sidesOf(id);
  const ax = axis(box.x0, box.x1, d.dx, side.x);
  const ay = axis(box.y0, box.y1, d.dy, side.y);
  return uniform ? uniformOf(ax, ay, box) : { origin: { x: ax.origin, y: ay.origin }, sx: ax.f, sy: ay.f };
}

const scalePt = (p: Pt, o: Pt, sx: number, sy: number): Pt => ({ x: o.x + (p.x - o.x) * sx, y: o.y + (p.y - o.y) * sy });

/** The selected anchors (and their handles) scaled by `s` about its pivot. */
export function scaleAnchors(m: PathModel, refs: readonly AnchorRef[], s: ScaleSpec): PathModel {
  const out = cloneModel(m);
  const at = (p: Pt) => scalePt(p, s.origin, s.sx, s.sy);
  for (const r of refs) {
    const a = out.subs[r.sub]?.anchors[r.i];
    if (a === undefined) continue;
    out.subs[r.sub].anchors[r.i] = { ...a, ...at(a), in: a.in && at(a.in), out: a.out && at(a.out) };
  }
  return out;
}

// --- rotation (2026-11-06) ---------------------------------------------------

/** The rotate handle: above the top-middle handle (`pad` outside the box, then a `stem`). */
export function rotateHandleOf(box: Box, pad: number, stem: number): Pt {
  return { x: (box.x0 + box.x1) / 2, y: box.y0 - pad - stem };
}

/** The angle (radians, clockwise on screen) from `start` to `p` around `c`; Shift snaps to 15°. */
export function rotateAngle(c: Pt, start: Pt, p: Pt, snap: boolean): number {
  const a = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
  const step = Math.PI / 12;
  return snap ? Math.round(a / step) * step : a;
}

/** The selected anchors (and their handles) turned by `angle` around `c`. */
export function rotateAnchors(m: PathModel, refs: readonly AnchorRef[], c: Pt, angle: number): PathModel {
  const out = cloneModel(m);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const turn = (p: Pt): Pt => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos });
  for (const r of refs) {
    const a = out.subs[r.sub]?.anchors[r.i];
    if (a === undefined) continue;
    out.subs[r.sub].anchors[r.i] = { ...a, ...turn(a), in: a.in && turn(a.in), out: a.out && turn(a.out) };
  }
  return out;
}

/** How big the corner rotate zones are (all in path units). */
export interface ZoneSize { pad: number; handle: number; reach: number }
export type CornerId = "nw" | "ne" | "se" | "sw";

/**
 * Just outside a corner of the (padded) box, past its scale handle and within
 * `reach` of it, a drag rotates (2026-11-06) — the design-tool corner gesture.
 */
export function rotateZoneAt(box: Box, p: Pt, z: ZoneSize): CornerId | null {
  const x0 = box.x0 - z.pad, y0 = box.y0 - z.pad, x1 = box.x1 + z.pad, y1 = box.y1 + z.pad;
  const outside = p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1;
  if (!outside) return null;
  const corners: [CornerId, Pt][] = [["nw", { x: x0, y: y0 }], ["ne", { x: x1, y: y0 }], ["se", { x: x1, y: y1 }], ["sw", { x: x0, y: y1 }]];
  for (const [id, c] of corners) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d > z.handle && d <= z.reach) return id;
  }
  return null;
}
