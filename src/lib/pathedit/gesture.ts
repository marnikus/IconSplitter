// gesture.ts — the editor's pointer and key rules (2026-11-06), as a pure state
// machine: the component turns DOM events into inputs (point in path units,
// modifiers, units per screen pixel) and stores what comes back. A drag
// recomputes from the model at its start and becomes ONE undo step on release.
//
// Select: click selects, drag moves (anchor, handle, segment), empty drag is a
// marquee, Ctrl+click toggles smooth/corner, Alt on a smooth handle breaks the
// mirror, Shift snaps the grabbed anchor, Alt+click on a line removes that one
// segment (the rest stays), double-click selects a whole line (Shift adds it, Alt excludes it), Ctrl+A selects everything, dragging a box edge along itself skews the group by angle about its centre, Alt+Shift+click removes the part between the two
// crossings around the click (hover shows it). Draw: empty click adds (a drag pulls
// a smooth pair), segment click inserts, first anchor closes, another open
// end joins. Keys: Delete, Esc, Enter (= Finish), Ctrl+Z / Ctrl+Y.

import { anchorsInRect, objectAt, snapPoint, type Hit, type Snap } from "./hit";
import { hitOf } from "./hitof";
import { cutStretchAt, removeAt } from "./linegesture";
import { nextIndex, type AnchorRef, type PathModel, type Pt } from "./model";
import {
  addAnchor, breakSmooth, closeSubpath, insertOnSegment, joinSubpaths,
  moveAnchors, moveHandle, pullHandles, toggleSmooth,
} from "./ops";
import { commit, preview, type EditSession } from "./session";
import { rotateAnchors, rotateAngle, scaleAnchors, scaleFor, type Box, type BoxHandleId } from "./scale";
import { boxCursorAt, boxTargetAt } from "./boxtarget";
import { alongEdge, boxCenter, skewAngleFor, skewAnchors, skewedCorners, type SkewEdge } from "./skew";
import { HIT_PX } from "./hitpx";

export interface PointerInput {
  p: Pt;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Path units per screen pixel — hit radii are pixels. */
  unitsPerPx: number;
  /** The icon path ("object") under the pointer, when the click landed on one. */
  target?: number | null;
  /** How far (screen px) from a shape a single click still picks it — Edit settings; HIT_PX.pick when absent. */
  pickPx?: number;
  /** The event's time (ms): quick clicks that make a double-click are told apart by it. */
  time?: number;
}

type Drag =
  | { kind: "anchors"; before: PathModel; refs: AnchorRef[]; grab: AnchorRef; start: Pt; grabStart: Pt }
  | { kind: "handle"; before: PathModel; base: PathModel; ref: AnchorRef; side: "in" | "out" }
  | { kind: "marquee"; start: Pt; objects: number[]; base: AnchorRef[]; mode: SelectMode }
  | { kind: "draw"; before: PathModel; base: PathModel; ref: AnchorRef }
  | { kind: "scale"; before: PathModel; refs: AnchorRef[]; handle: BoxHandleId; box: Box; start: Pt }
  | { kind: "rotate"; before: PathModel; refs: AnchorRef[]; center: Pt; start: Pt }
  | { kind: "skew"; before: PathModel; refs: AnchorRef[]; edge: SkewEdge; box: Box; start: Pt };

/** How a click or box changes the anchor selection: plain replaces, Shift adds, Alt removes. */
export type SelectMode = "replace" | "add" | "remove";
const modeOf = (input: PointerInput): SelectMode => (input.alt ? "remove" : input.shift ? "add" : "replace");

export interface EditorState {
  session: EditSession;
  drag: Drag | null;
  /** The Shift-snap target shown while dragging. */
  snap: Snap | null;
  marquee: { a: Pt; b: Pt } | null;
  /** When the last arrow-key nudge happened: a quick burst is one undo step (keys.ts). */
  nudgeAt?: number;
  /** Alt + Shift over a line: the stretch between its two crossings a click would remove (drawn red). */
  cutHint?: Pt[] | null;
  /** While a box edge is dragged: the angle (degrees), the pointer, the fixed centre and the skewed box (drawn by the overlay). */
  skewHint?: { angle: number; at: Pt; center: Pt; quad: Pt[] } | null;
  /** The last Alt + click that removed a segment: when it was and the session before it (an Alt + double-click undoes it). */
  lineCut?: { at: number; before: EditSession } | null;
}

/** Hit radii in screen pixels: generous anchors and handles, a 6 px band around a segment. */
export { HIT_PX } from "./hitpx";
export { scaleBoxOf } from "./boxtarget";

/** The cursor a hover should show over the selection box (rotate / resize), or null. */
export function cursorAt(st: EditorState, input: PointerInput): string | null {
  return st.drag === null ? boxCursorAt(st.session, input.p, input.unitsPerPx) : null;
}

/** A press on the box: the knob or a corner zone starts a rotation, a handle a scale drag, an edge a distortion. */
function scaleDown(st: EditorState, input: PointerInput): EditorState | null {
  const t = boxTargetAt(st.session, input.p, input.unitsPerPx);
  if (t === null) return null;
  const { box } = t;
  const base = { before: st.session.model, refs: st.session.selection, start: input.p };
  if (t.kind === "skew") return { ...st, drag: { kind: "skew", ...base, edge: t.edge, box } };
  if (t.kind === "rotate") return { ...st, drag: { kind: "rotate", ...base, center: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 } } };
  return { ...st, drag: { kind: "scale", ...base, handle: t.handle, box } };
}

/** Corner: free; edge: one direction; Shift keeps the proportions. */
function scaleMove(st: EditorState, d: Extract<Drag, { kind: "scale" }>, input: PointerInput): EditorState {
  const f = scaleFor(d.handle, d.box, { dx: input.p.x - d.start.x, dy: input.p.y - d.start.y }, input.shift);
  return withSession(st, preview(st.session, scaleAnchors(d.before, d.refs, f)));
}

/** An edge drag: skew by the angle the pointer's travel asks for (Shift: 15° steps), and say so. */
function skewMove(st: EditorState, d: Extract<Drag, { kind: "skew" }>, input: PointerInput): EditorState {
  const angle = skewAngleFor(d.edge, d.box, alongEdge(d.edge, d.start, input.p), input.shift);
  const skewHint = { angle: (angle * 180) / Math.PI, at: input.p, center: boxCenter(d.box), quad: skewedCorners(d.box, d.edge, angle) };
  return { ...withSession(st, preview(st.session, skewAnchors(d.before, d.refs, { edge: d.edge, box: d.box, angle }))), skewHint };
}

export function editorState(session: EditSession): EditorState {
  return { session, drag: null, snap: null, marquee: null };
}

const at = (m: PathModel, r: AnchorRef): Pt => m.subs[r.sub].anchors[r.i];
const hasRef = (list: readonly AnchorRef[], r: AnchorRef): boolean => list.some((x) => x.sub === r.sub && x.i === r.i);
const withSession = (st: EditorState, session: EditSession): EditorState => ({ ...st, session });

export function pointerDown(st: EditorState, input: PointerInput): EditorState {
  const next = pressDown(st, input);
  return next.cutHint ? { ...next, cutHint: null } : next;
}

function pressDown(st: EditorState, input: PointerInput): EditorState {
  const scaling = scaleDown(st, input);
  if (scaling !== null) return scaling;
  const hit = hitOf(st.session, input);
  return st.session.tool === "draw" ? drawDown(st, input, hit) : selectDown(st, input, hit);
}

/** A click on a path: it alone becomes the selection; with Shift it is added or removed. */
function selectObject(s: EditSession, target: number, additive: boolean): EditSession {
  if (!additive) return { ...s, objects: [target], selection: [], active: null };
  const objects = s.objects.includes(target) ? s.objects.filter((o) => o !== target) : [...s.objects, target];
  const selection = s.selection.filter((r) => objects.includes(s.model.subs[r.sub]?.owner ?? -1));
  return { ...s, objects, selection, active: null };
}

function selectDown(st: EditorState, input: PointerInput, hit: Hit): EditorState {
  if (hit.kind !== "none") return pressOn(st, input, hit);
  const s = st.session;
  const mode = modeOf(input);
  const target = mode === "remove" ? null : pickedObject(s, input);
  if (target !== null) return withSession(st, selectObject(s, target, input.shift));
  const base = mode === "replace" ? [] : s.selection;
  return { ...st, session: { ...s, selection: base }, drag: { kind: "marquee", start: input.p, objects: s.objects, base, mode }, marquee: null };
}

/** A press on something: Alt on a line removes it, Ctrl toggles a point / inserts on a line, a handle starts a handle drag, else a move. */
function pressOn(st: EditorState, input: PointerInput, hit: Exclude<Hit, { kind: "none" }>): EditorState {
  const s = st.session;
  if (hit.kind === "handle") {
    const base = input.alt ? breakSmooth(s.model, hit.ref) : s.model;
    return { ...st, session: preview(s, base), drag: { kind: "handle", before: s.model, base, ref: hit.ref, side: hit.side } };
  }
  if (input.alt && hit.kind === "segment") return input.shift ? cutStretchAt(st, hit) : removeAt(st, hit, input.time);
  if (input.ctrl) {
    return hit.kind === "segment" ? insertAt(st, hit) : withSession(st, { ...commit(s, toggleSmooth(s.model, hit.ref)), selection: [hit.ref] });
  }
  return grab(st, input, hit);
}

/** The shape a single click picks: within the click tolerance (Edit settings, screen px) of its line, or inside it. */
function pickedObject(s: EditSession, input: PointerInput): number | null {
  const r = (input.pickPx ?? HIT_PX.pick) * input.unitsPerPx;
  return objectAt(s.model, input.p, { anchor: r, handle: r, segment: r }, (o) => s.objects.includes(o)) ?? input.target ?? null;
}

const sameRef = (a: AnchorRef, b: AnchorRef): boolean => a.sub === b.sub && a.i === b.i;

/** The box's anchors applied by mode: replace, add to (Shift) or remove from (Alt) the selection at its start. */
function boxSelection(d: Extract<Drag, { kind: "marquee" }>, inRect: AnchorRef[]): AnchorRef[] {
  if (d.mode === "replace") return inRect;
  if (d.mode === "remove") return d.base.filter((r) => !inRect.some((x) => sameRef(x, r)));
  return [...d.base, ...inRect.filter((r) => !d.base.some((x) => sameRef(x, r)))];
}

/** The marquee takes anchors of every path inside it (Shift adds, Alt removes) and selects the paths it adds. */
function marqueeMove(st: EditorState, d: Extract<Drag, { kind: "marquee" }>, p: Pt): EditorState {
  const s = st.session;
  const inRect = anchorsInRect(s.model, d.start, p);
  const selection = boxSelection(d, inRect);
  const owners = d.mode === "remove" ? [] : inRect.map((r) => s.model.subs[r.sub].owner).filter((o): o is number => o !== undefined);
  const objects = [...new Set([...d.objects, ...owners])];
  return { ...st, marquee: { a: d.start, b: p }, session: { ...s, selection, objects } };
}

/** The selection a press on an anchor makes: Alt removes it, Shift adds it, plain keeps a selection that holds it. */
function pressSelection(selection: AnchorRef[], ref: AnchorRef, mode: SelectMode): AnchorRef[] {
  if (mode === "remove") return selection.filter((r) => !sameRef(r, ref));
  if (hasRef(selection, ref)) return selection;
  return mode === "add" ? [...selection, ref] : [ref];
}

/** Press on an anchor (Shift adds it, Alt removes it — no move) or a segment (its two anchors): starts a move. */
function grab(st: EditorState, input: PointerInput, hit: Extract<Hit, { kind: "anchor" | "segment" }>): EditorState {
  const s = st.session;
  const p = input.p;
  if (hit.kind === "anchor") {
    const mode = modeOf(input);
    const selection = pressSelection(s.selection, hit.ref, mode);
    if (mode === "remove") return withSession(st, { ...s, selection });
    return { ...st, session: { ...s, selection }, drag: anchorDrag(s.model, selection, hit.ref, p) };
  }
  const j = nextIndex(s.model.subs[hit.sub], hit.i) ?? hit.i;
  const refs = [{ sub: hit.sub, i: hit.i }, { sub: hit.sub, i: j }];
  // a line of the selection drags the whole selection, like one of its anchors (2026-11-06)
  const held = refs.find((r) => hasRef(s.selection, r));
  if (held !== undefined) return { ...st, drag: anchorDrag(s.model, s.selection, held, p) };
  // Shift adds the line's two points to the selection (2026-11-10), a plain press replaces it
  const next = input.shift ? [...s.selection, ...refs.filter((r) => !hasRef(s.selection, r))] : refs;
  return { ...st, session: { ...s, selection: next }, drag: anchorDrag(s.model, next, refs[0], p) };
}

function anchorDrag(model: PathModel, refs: AnchorRef[], grab: AnchorRef, start: Pt): Drag {
  const g = at(model, grab);
  return { kind: "anchors", before: model, refs, grab, start, grabStart: { x: g.x, y: g.y } };
}

/** Draw on an anchor: close the active path, join another open end, or just select it. */
function drawOnAnchor(s: EditSession, ref: AnchorRef): EditSession {
  const active = s.active === null ? undefined : s.model.subs[s.active];
  if (active !== undefined && ref.sub === s.active && ref.i === 0 && active.anchors.length >= 2) {
    return { ...commit(s, closeSubpath(s.model, ref.sub)), active: null, selection: [ref] };
  }
  if (s.active !== null && ref.sub !== s.active) {
    const joined = joinSubpaths(s.model, s.active, ref);
    if (joined !== null) return { ...commit(s, joined.model), active: joined.active, selection: [] };
  }
  return { ...s, selection: [ref] };
}

function drawDown(st: EditorState, input: PointerInput, hit: Hit): EditorState {
  const s = st.session;
  if (hit.kind === "anchor") return withSession(st, drawOnAnchor(s, hit.ref));
  if (hit.kind === "segment") {
    const ins = insertOnSegment(s.model, hit.sub, hit.i, hit.t);
    return ins === null ? st : withSession(st, { ...commit(s, ins.model), selection: [ins.ref] });
  }
  const owner = s.active === null ? s.objects[0] : s.model.subs[s.active]?.owner;
  const added = addAnchor(s.model, s.active, input.p, owner);
  const session = { ...preview(s, added.model), active: added.ref.sub, selection: [added.ref] };
  return { ...st, session, drag: { kind: "draw", before: s.model, base: added.model, ref: added.ref } };
}

/** Shift: the grabbed anchor snaps (to the drag-start model); every selected anchor moves by the same delta. */
function anchorMove(st: EditorState, d: Extract<Drag, { kind: "anchors" }>, input: PointerInput): EditorState {
  let dx = input.p.x - d.start.x;
  let dy = input.p.y - d.start.y;
  const snap = input.shift
    ? snapPoint(d.before, { x: d.grabStart.x + dx, y: d.grabStart.y + dy }, d.grab, HIT_PX.snap * input.unitsPerPx)
    : null;
  if (snap !== null) { dx = snap.pt.x - d.grabStart.x; dy = snap.pt.y - d.grabStart.y; }
  return { ...st, snap, session: preview(st.session, moveAnchors(d.before, d.refs, dx, dy)) };
}

export function pointerMove(st: EditorState, input: PointerInput): EditorState {
  const d = st.drag;
  if (d === null) return st;
  if (d.kind === "anchors") return anchorMove(st, d, input);
  if (d.kind === "scale") return scaleMove(st, d, input);
  if (d.kind === "skew") return skewMove(st, d, input);
  if (d.kind === "rotate") return withSession(st, preview(st.session, rotateAnchors(d.before, d.refs, d.center, rotateAngle(d.center, d.start, input.p, input.shift))));
  if (d.kind === "handle") return withSession(st, preview(st.session, moveHandle(d.base, d.ref, d.side, input.p)));
  if (d.kind === "marquee") return marqueeMove(st, d, input.p);
  const a = at(d.base, d.ref);
  const far = Math.hypot(input.p.x - a.x, input.p.y - a.y) > HIT_PX.pull * input.unitsPerPx;
  return withSession(st, preview(st.session, far ? pullHandles(d.base, d.ref, input.p) : d.base));
}

/** Release: the gesture becomes one undo step (a plain click changed nothing and records nothing). */
export function pointerUp(st: EditorState): EditorState {
  const d = st.drag;
  const cleared = { ...st, drag: null, snap: null, marquee: null, skewHint: null };
  if (d === null || d.kind === "marquee") return cleared;
  return { ...cleared, session: commit(st.session, st.session.model, d.before) };
}

/** Ctrl + click on a line (2026-11-06): an anchor is inserted there (the shape is kept). */
function insertAt(st: EditorState, hit: Extract<Hit, { kind: "segment" }>): EditorState {
  const ins = insertOnSegment(st.session.model, hit.sub, hit.i, hit.t);
  return ins === null ? st : withSession(st, { ...commit(st.session, ins.model), selection: [ins.ref] });
}

export { clearEditClipboard, keyDown, type KeyInput } from "./keys";
export { doubleClick, hoverAt } from "./linegesture";
