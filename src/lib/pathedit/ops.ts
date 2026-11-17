// ops.ts — every edit the path editor can make (2026-11-06), as pure functions
// over the point model: they return a NEW model and never touch the one they
// were given (a drag recomputes from the model at its start). Moving anchors,
// handles (mirrored for smooth, independent for broken), Ctrl-click
// smooth ↔ corner, delete with the subpath rules, insert on a segment (the
// shape is kept), and Draw's add / close / join.

import {
  cloneModel, modeOf, nextIndex, prevIndex, segmentCubic, splitCubic,
  type Anchor, type AnchorRef, type PathModel, type Pt, type SubPath,
} from "./model";

const shift = (p: Pt | null, dx: number, dy: number): Pt | null => (p === null ? null : { x: p.x + dx, y: p.y + dy });
const mirror = (a: Pt, p: Pt): Pt => ({ x: 2 * a.x - p.x, y: 2 * a.y - p.y });

/** Moves each anchor (and its handles) by the same delta. */
export function moveAnchors(m: PathModel, refs: readonly AnchorRef[], dx: number, dy: number): PathModel {
  const out = cloneModel(m);
  for (const r of refs) {
    const a = out.subs[r.sub]?.anchors[r.i];
    if (a === undefined) continue;
    out.subs[r.sub].anchors[r.i] = { ...a, x: a.x + dx, y: a.y + dy, in: shift(a.in, dx, dy), out: shift(a.out, dx, dy) };
  }
  return out;
}

/** One handle to `p`; a smooth point mirrors the other at the same length, a broken one does not. */
export function moveHandle(m: PathModel, ref: AnchorRef, side: "in" | "out", p: Pt): PathModel {
  const out = cloneModel(m);
  const a = out.subs[ref.sub]?.anchors[ref.i];
  if (a === undefined || a[side] === null) return out;
  a[side] = { x: p.x, y: p.y };
  if (a.mode === "smooth") a[side === "in" ? "out" : "in"] = mirror(a, p);
  return out;
}

/** Alt on a smooth point's handle: the mirror is broken (it is never restored silently). */
export function breakSmooth(m: PathModel, ref: AnchorRef): PathModel {
  const out = cloneModel(m);
  const a = out.subs[ref.sub]?.anchors[ref.i];
  if (a !== undefined && a.mode === "smooth") a.mode = "broken";
  return out;
}

const unit = (dx: number, dy: number): Pt => {
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
};

/** A fresh smooth pair: along the neighbours, a third of the shorter neighbouring segment. */
function smoothPair(a: Anchor, prev: Anchor | null, next: Anchor | null): Pick<Anchor, "in" | "out"> | null {
  if (prev === null && next === null) return null;
  const from = prev ?? a;
  const to = next ?? a;
  const dir = unit(to.x - from.x, to.y - from.y);
  const lens = [prev, next].filter((n): n is Anchor => n !== null).map((n) => Math.hypot(n.x - a.x, n.y - a.y));
  const len = Math.min(...lens) / 3;
  return { in: { x: a.x - dir.x * len, y: a.y - dir.y * len }, out: { x: a.x + dir.x * len, y: a.y + dir.y * len } };
}

/** Ctrl + click: a corner gets a smooth pair; a smooth or broken point loses both handles. Never moves it. */
export function toggleSmooth(m: PathModel, ref: AnchorRef): PathModel {
  const out = cloneModel(m);
  const sub = out.subs[ref.sub];
  const a = sub?.anchors[ref.i];
  if (a === undefined) return out;
  if (a.mode !== "corner") { Object.assign(a, { in: null, out: null, mode: "corner" }); return out; }
  const p = prevIndex(sub, ref.i);
  const n = nextIndex(sub, ref.i);
  const pairOf = smoothPair(a, p === null ? null : sub.anchors[p], n === null ? null : sub.anchors[n]);
  if (pairOf !== null) Object.assign(a, pairOf, { mode: "smooth" });
  return out;
}

/** What is left of one subpath after removing anchors: kept, opened, or gone. */
function trimmed(sub: SubPath, anchors: Anchor[]): SubPath | null {
  if (anchors.length < 2) return null; // a lone point is no subpath
  return { ...sub, anchors, closed: sub.closed && anchors.length >= 3 };
}

/** Delete: neighbours join, their own handles stay; the subpath rules decide what remains. */
export function deleteAnchors(m: PathModel, refs: readonly AnchorRef[]): PathModel {
  const out = cloneModel(m);
  const subs = out.subs.flatMap((sub, s) => {
    const drop = new Set(refs.filter((r) => r.sub === s).map((r) => r.i));
    if (drop.size === 0) return [sub];
    const kept = trimmed(sub, sub.anchors.filter((_, i) => !drop.has(i)));
    return kept === null ? [] : [kept];
  });
  return { subs };
}

/** Inserts an anchor on segment i at `t`, splitting it so the drawn shape does not change. */
export function insertOnSegment(m: PathModel, sub: number, i: number, t: number): { model: PathModel; ref: AnchorRef } | null {
  const out = cloneModel(m);
  const s = out.subs[sub];
  const cubic = s === undefined ? null : segmentCubic(s, i);
  const j = s === undefined ? null : nextIndex(s, i);
  if (cubic === null || j === null) return null;
  const [left, right] = splitCubic(cubic, t);
  const a = s.anchors[i];
  const b = s.anchors[j];
  const curve = a.out !== null || b.in !== null;
  const added: Anchor = { x: left[3].x, y: left[3].y, in: curve ? left[2] : null, out: curve ? right[1] : null, mode: "corner" };
  added.mode = modeOf(added);
  if (curve) { a.out = left[1]; b.in = right[2]; }
  s.anchors.splice(i + 1, 0, added);
  return { model: out, ref: { sub, i: i + 1 } };
}

/** Draw: a new anchor at the end of the active open subpath, or the start of a new one (in object `owner`). */
export function addAnchor(m: PathModel, active: number | null, p: Pt, owner?: number): { model: PathModel; ref: AnchorRef } {
  const out = cloneModel(m);
  const anchor: Anchor = { x: p.x, y: p.y, in: null, out: null, mode: "corner" };
  const sub = active === null ? undefined : out.subs[active];
  if (sub === undefined || sub.closed) {
    out.subs.push({ anchors: [anchor], closed: false, ...(owner === undefined ? {} : { owner }) });
    return { model: out, ref: { sub: out.subs.length - 1, i: 0 } };
  }
  sub.anchors.push(anchor);
  return { model: out, ref: { sub: active as number, i: sub.anchors.length - 1 } };
}

/** Draw's mouse-down drag: pulls a smooth pair out of the anchor just placed. */
export function pullHandles(m: PathModel, ref: AnchorRef, to: Pt): PathModel {
  const out = cloneModel(m);
  const a = out.subs[ref.sub]?.anchors[ref.i];
  if (a !== undefined) Object.assign(a, { out: { x: to.x, y: to.y }, in: mirror(a, to), mode: "smooth" });
  return out;
}

/** Clicking the first anchor of the open path closes it. */
export function closeSubpath(m: PathModel, sub: number): PathModel {
  const out = cloneModel(m);
  if (out.subs[sub] !== undefined && out.subs[sub].anchors.length >= 2) out.subs[sub].closed = true;
  return out;
}

/** Reverses a subpath's direction (handles swap sides). */
function reversed(anchors: Anchor[]): Anchor[] {
  return [...anchors].reverse().map((a) => ({ ...a, in: a.out, out: a.in }));
}

/** Joins the end of the active open subpath to an endpoint of another open one. */
/** Two different open subpaths, `other` naming an endpoint of its own. */
function joinable(m: PathModel, active: number, other: AnchorRef): boolean {
  const a = m.subs[active];
  const b = m.subs[other.sub];
  if (a === undefined || b === undefined || active === other.sub || a.closed || b.closed) return false;
  return other.i === 0 || other.i === b.anchors.length - 1;
}

export function joinSubpaths(m: PathModel, active: number, other: AnchorRef): { model: PathModel; active: number } | null {
  if (!joinable(m, active, other)) return null;
  const a = m.subs[active];
  const b = m.subs[other.sub];
  const tail = other.i === 0 ? b.anchors : reversed(b.anchors);
  const joined: SubPath = { ...(a.owner === undefined ? {} : { owner: a.owner }), anchors: [...cloneModel({ subs: [a] }).subs[0].anchors, ...cloneModel({ subs: [{ anchors: tail, closed: false }] }).subs[0].anchors], closed: false };
  const subs = m.subs.map((s, i) => (i === active ? joined : s)).filter((_, i) => i !== other.sub);
  return { model: cloneModel({ subs }), active: active > other.sub ? active - 1 : active };
}

/** One run of kept anchors as an open subpath: its ends lose the handles that pointed at removed segments. */
export function openRun(run: Anchor[], owner: number | undefined): SubPath | null {
  if (run.length < 2) return null; // a lone point is no line
  const anchors = run.map((a) => ({ ...a }));
  const first = anchors[0], last = anchors[anchors.length - 1];
  first.in = null;
  last.out = null;
  first.mode = modeOf(first);
  last.mode = modeOf(last);
  return { anchors, closed: false, ...(owner === undefined ? {} : { owner }) };
}

/** The anchors in walking order, starting right after the first removed one on a closed subpath. */
function walkOrder(sub: SubPath, drop: Set<number>): number[] {
  const n = sub.anchors.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (!sub.closed) return idx;
  const first = idx.find((i) => drop.has(i)) ?? 0;
  return [...idx.slice(first + 1), ...idx.slice(0, first + 1)];
}

/** Ctrl + Delete (2026-11-06): the line breaks at each selected point; the point and its two segments go. */
export function breakAtAnchors(m: PathModel, refs: readonly AnchorRef[]): PathModel {
  const out = cloneModel(m);
  const subs = out.subs.flatMap((sub, s) => {
    const drop = new Set(refs.filter((r) => r.sub === s).map((r) => r.i));
    if (drop.size === 0) return [sub];
    const runs: Anchor[][] = [[]];
    for (const i of walkOrder(sub, drop)) {
      if (drop.has(i)) runs.push([]);
      else runs[runs.length - 1].push(sub.anchors[i]);
    }
    return runs.map((r) => openRun(r, sub.owner)).filter((r): r is SubPath => r !== null);
  });
  return { subs };
}

/**
 * Alt + click on a line (2026-11-09): removes only segment `i` (anchor i → the next). Both anchors stay,
 * every other segment keeps its exact shape; an open line splits in two, a closed shape opens there.
 * The handles that belonged to the removed segment go; a lone point left behind is no line.
 */
export function removeSegment(m: PathModel, sub: number, i: number): PathModel | null {
  const s = m.subs[sub];
  const j = s === undefined ? null : nextIndex(s, i);
  if (s === undefined || j === null) return null;
  const a = s.anchors;
  const runs = s.closed ? [[...a.slice(j), ...a.slice(0, j)]] : [a.slice(0, i + 1), a.slice(j)];
  const pieces = runs.map((r) => openRun(r, s.owner)).filter((r): r is SubPath => r !== null);
  const subs = m.subs.flatMap((x, k) => (k === sub ? pieces : [x]));
  return cloneModel({ subs });
}
