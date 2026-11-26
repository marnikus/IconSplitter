// drawgesture.ts — Draw (the pen) on lines and their ends (2026-11-26; split
// from gesture.ts). An empty click adds an anchor to the active line (a held
// drag pulls a smooth pair); a click on a segment inserts one. With no line
// active, a press on an open line's END picks that end up and the line goes on
// from it — either end, of any path. While drawing, a press on the active line's
// other end closes it; on another open line's end joins the two. A held drag on
// the end picked up, closed or joined pulls a smooth pair there too. Each press
// and its drag is ONE undo step (released in gesture.ts `pointerUp`). Pure.

import type { EditorState, PointerInput } from "./gesture";
import type { Hit } from "./hit";
import { radii } from "./hitof";
import type { AnchorRef, PathModel } from "./model";
import { addAnchor, closeSubpath, insertOnSegment, joinSubpaths, prependAnchor, reverseSub } from "./ops";
import { commit, preview, type EditSession } from "./session";

/** The draw drag: `base` is the model at the press, `back` = the line is drawn backwards from its first anchor. */
export interface DrawDrag { kind: "draw"; before: PathModel; base: PathModel; ref: AnchorRef; back?: boolean }

/** Does the active line grow at its first anchor? */
export const drawsAtStart = (s: EditSession): boolean => s.active !== null && s.activeStart === s.active;

/** Is `ref` an end of an open line? */
function isOpenEnd(m: PathModel, ref: AnchorRef): boolean {
  const sub = m.subs[ref.sub];
  return sub !== undefined && !sub.closed && (ref.i === 0 || ref.i === sub.anchors.length - 1);
}

/** The open-line end nearest the pointer within the anchor radius, among ALL paths (picking one up selects its path). */
function openEndAt(m: PathModel, input: PointerInput): AnchorRef | null {
  const r = radii(input.unitsPerPx).anchor;
  let best: { ref: AnchorRef; d: number } | null = null;
  m.subs.forEach((sub, si) => {
    if (sub.closed) return;
    for (const i of new Set([0, sub.anchors.length - 1])) {
      const a = sub.anchors[i];
      const d = a === undefined ? Infinity : Math.hypot(a.x - input.p.x, a.y - input.p.y);
      if (d <= r && (best === null || d < best.d)) best = { ref: { sub: si, i }, d };
    }
  });
  return (best as { ref: AnchorRef } | null)?.ref ?? null;
}

const drawDrag = (before: PathModel, base: PathModel, ref: AnchorRef, back = false): DrawDrag => ({ kind: "draw", before, base, ref, back });

/** No line active: an open end is picked up — the next clicks go on from it (its path joins the selected ones). */
function pickUp(st: EditorState, ref: AnchorRef): EditorState {
  const s = st.session;
  const back = ref.i === 0 && s.model.subs[ref.sub].anchors.length > 1;
  const owner = s.model.subs[ref.sub].owner;
  const objects = owner === undefined || s.objects.includes(owner) ? s.objects : [...s.objects, owner];
  const session = { ...s, objects, active: ref.sub, activeStart: back ? ref.sub : null, selection: [ref] };
  return { ...st, session, drag: drawDrag(s.model, s.model, ref, back) };
}

/** The active line's other end closes it. */
function closeAt(st: EditorState, ref: AnchorRef): EditorState {
  const s = st.session;
  const closed = closeSubpath(s.model, ref.sub);
  const session = { ...preview(s, closed), active: null, activeStart: null, selection: [ref] };
  return { ...st, session, drag: drawDrag(s.model, closed, ref, drawsAtStart(s)) };
}

/** Another open line's end joins it to the active line, which goes on from that line's far end. */
function joinAt(st: EditorState, ref: AnchorRef): EditorState | null {
  const s = st.session;
  const active = s.active as number;
  const base = drawsAtStart(s) ? reverseSub(s.model, active) : s.model;
  const joined = joinSubpaths(base, active, ref);
  if (joined === null) return null;
  const at = { sub: joined.active, i: base.subs[active].anchors.length };
  const session = { ...preview(s, joined.model), active: joined.active, activeStart: null, selection: [] };
  return { ...st, session, drag: drawDrag(s.model, joined.model, at) };
}

/** A press on an anchor: pick an end up, close, join — or just select it. */
function drawOnAnchor(st: EditorState, ref: AnchorRef): EditorState {
  const s = st.session;
  const m = s.model;
  if (!isOpenEnd(m, ref)) return { ...st, session: { ...s, selection: [ref] } };
  if (s.active === null) return pickUp(st, ref);
  if (ref.sub === s.active) {
    const n = m.subs[ref.sub].anchors.length;
    const other = drawsAtStart(s) ? n - 1 : 0;
    return n >= 2 && ref.i === other ? closeAt(st, ref) : { ...st, session: { ...s, selection: [ref] } };
  }
  return joinAt(st, ref) ?? { ...st, session: { ...s, selection: [ref] } };
}

/** A new anchor on the active line's growing end (or a new line); a held drag then pulls its smooth pair. */
function addAt(st: EditorState, input: PointerInput): EditorState {
  const s = st.session;
  const back = drawsAtStart(s);
  const owner = s.active === null ? s.objects[0] : s.model.subs[s.active]?.owner;
  const added = back ? prependAnchor(s.model, s.active as number, input.p) : addAnchor(s.model, s.active, input.p, owner);
  const session = { ...preview(s, added.model), active: added.ref.sub, activeStart: back ? added.ref.sub : null, selection: [added.ref] };
  return { ...st, session, drag: drawDrag(s.model, added.model, added.ref, back) };
}

export function drawDown(st: EditorState, input: PointerInput, hit: Hit): EditorState {
  const s = st.session;
  if (hit.kind === "anchor") return drawOnAnchor(st, hit.ref);
  const end = s.active === null ? openEndAt(s.model, input) : null;
  if (end !== null) return drawOnAnchor(st, end);
  if (hit.kind === "segment") {
    const ins = insertOnSegment(s.model, hit.sub, hit.i, hit.t);
    return ins === null ? st : { ...st, session: { ...commit(s, ins.model), selection: [ins.ref] } };
  }
  return addAt(st, input);
}
