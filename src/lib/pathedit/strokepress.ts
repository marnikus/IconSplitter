// strokepress.ts — a stroke-only line is its own object (2026-11-23). A line
// drawn by its pen only (no fill, or open with a stroke) is picked where it is
// DRAWN: within its half pen width plus the click tolerance of its centre line,
// never from the empty space it encloses. A plain press there selects that one
// line — not the other lines of the same <path> — and dragging moves just it;
// a press that does not move only selects. Once a point of the line is picked,
// its segments edit points again (gesture.ts `grab`). Pure.

import type { EditorState, PointerInput } from "./gesture";
import { nearestOnSegment, type Hit } from "./hit";
import { HIT_PX } from "./hitpx";
import type { AnchorRef, PathModel, Pt, SubPath } from "./model";
import type { EditSession } from "./session";

/** Drawn by its pen only: a shape that does not fill, or an open line with a stroke (an open path without one is a fill). */
export const isStrokeLine = (s: SubPath | undefined): boolean =>
  s !== undefined && (s.paints === false || (!s.closed && (s.halfStroke ?? 0) > 0));

/** How far outside its drawn edge `p` is (negative on the pen), or null beyond `reach` of the edge. */
function edgeGap(s: SubPath, p: Pt, reach: number): number | null {
  const half = s.halfStroke ?? 0;
  let best: number | null = null;
  for (let i = 0; i < s.anchors.length; i++) {
    const n = nearestOnSegment(s, i, p, reach + half);
    if (n !== null && n.d <= reach + half) best = Math.min(best ?? Infinity, n.d - half);
  }
  return best;
}

/** The stroke line whose drawn edge is nearest `p` within `reach` (the topmost on a tie), or null. */
export function strokeLineAt(m: PathModel, p: Pt, reach: number): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  m.subs.forEach((s, sub) => {
    const gap = isStrokeLine(s) ? edgeGap(s, p, reach) : null;
    if (gap !== null && gap <= bestGap) { best = sub; bestGap = gap; }
  });
  return best;
}

/**
 * The stroke line a plain (or Shift) press takes whole, or null: a segment of a
 * line none of whose points is picked, or — over nothing editable — any stroke
 * line within the click tolerance (Edit settings) of where it is drawn.
 */
export function linePressSub(s: EditSession, input: PointerInput, hit: Hit): number | null {
  if (input.alt || input.ctrl || s.tool !== "select") return null;
  if (hit.kind === "segment") return isStrokeLine(s.model.subs[hit.sub]) && !s.selection.some((r) => r.sub === hit.sub) ? hit.sub : null;
  if (hit.kind !== "none") return null;
  return strokeLineAt(s.model, input.p, (input.pickPx ?? HIT_PX.pick) * input.unitsPerPx);
}

const hasRef = (list: readonly AnchorRef[], r: AnchorRef): boolean => list.some((x) => x.sub === r.sub && x.i === r.i);

function withOwner(objects: readonly number[], owner: number | undefined, additive: boolean): number[] {
  if (owner === undefined || objects.includes(owner)) return [...objects];
  return additive ? [...objects, owner] : [owner];
}

/** The press on line `sub`: it becomes the selection (Shift adds it; an already picked line keeps the selection) and a drag is armed. */
export function pressLine(st: EditorState, input: PointerInput, sub: number): EditorState {
  const s = st.session;
  const line = s.model.subs[sub].anchors.map((_, i) => ({ sub, i }));
  const held = line.every((r) => hasRef(s.selection, r));
  const selection = held ? s.selection : input.shift ? [...s.selection, ...line.filter((r) => !hasRef(s.selection, r))] : line;
  const objects = withOwner(s.objects, s.model.subs[sub].owner, input.shift);
  const first = s.model.subs[sub].anchors[0];
  const drag = { kind: "anchors" as const, before: s.model, refs: selection, grab: line[0], start: input.p,
    grabStart: { x: first.x, y: first.y }, minMove: HIT_PX.pull * input.unitsPerPx };
  return { ...st, session: { ...s, objects, selection, active: null }, drag };
}
