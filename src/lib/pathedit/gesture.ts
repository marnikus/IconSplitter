// gesture.ts — the editor's pointer and key rules (2026-11-06), as a pure state
// machine: the component turns DOM events into inputs (point in path units,
// modifiers, units per screen pixel) and stores what comes back. A drag
// recomputes from the model at its start and becomes ONE undo step on release.
//
// Select: click selects, drag moves (anchor, handle, segment), empty drag is a
// marquee, Ctrl+click toggles smooth/corner, Alt on a smooth handle breaks the
// mirror, Shift snaps the grabbed anchor. Draw: empty click adds (a drag pulls
// a smooth pair), segment click inserts, first anchor closes, another open
// end joins. Keys: Delete, Esc, Enter (= Finish), Ctrl+Z / Ctrl+Y.

import { anchorsInRect, hitTest, objectAt, snapPoint, type Hit, type HitRadii, type Snap } from "./hit";
import { nextIndex, type AnchorRef, type PathModel, type Pt } from "./model";
import {
  addAnchor, breakAtAnchors, breakSmooth, closeSubpath, deleteAnchors, insertOnSegment, joinSubpaths,
  moveAnchors, moveHandle, pullHandles, toggleSmooth,
} from "./ops";
import { commit, editableSub, preview, redoSession, undoSession, type EditSession } from "./session";
import { boxHandles, handleAt, scaleAnchors, scaleFor, selectionBox, type Box, type BoxHandleId } from "./scale";

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
}

type Drag =
  | { kind: "anchors"; before: PathModel; refs: AnchorRef[]; grab: AnchorRef; start: Pt; grabStart: Pt }
  | { kind: "handle"; before: PathModel; base: PathModel; ref: AnchorRef; side: "in" | "out" }
  | { kind: "marquee"; start: Pt; objects: number[]; base: AnchorRef[]; mode: SelectMode }
  | { kind: "draw"; before: PathModel; base: PathModel; ref: AnchorRef }
  | { kind: "scale"; before: PathModel; refs: AnchorRef[]; handle: BoxHandleId; box: Box; start: Pt };

/** How a click or box changes the anchor selection: plain replaces, Shift adds, Alt removes. */
export type SelectMode = "replace" | "add" | "remove";
const modeOf = (input: PointerInput): SelectMode => (input.alt ? "remove" : input.shift ? "add" : "replace");

export interface EditorState {
  session: EditSession;
  drag: Drag | null;
  /** The Shift-snap target shown while dragging. */
  snap: Snap | null;
  marquee: { a: Pt; b: Pt } | null;
}

/** Hit radii in screen pixels: generous anchors and handles, a 6 px band around a segment. */
export const HIT_PX = { anchor: 9, handle: 9, segment: 6, snap: 8, pull: 3, pick: 14, scalePad: 8, scaleHandle: 6 };

/** The selection's scale box, when two or more anchors are selected in Select (2026-11-06). */
export function scaleBoxOf(s: EditSession): Box | null {
  return s.tool === "select" && s.selection.length >= 2 ? selectionBox(s.model, s.selection) : null;
}

/** A press on one of the box's eight handles starts a scale drag. */
function scaleDown(st: EditorState, input: PointerInput): EditorState | null {
  const box = scaleBoxOf(st.session);
  if (box === null) return null;
  const u = input.unitsPerPx;
  const handle = handleAt(boxHandles(box, HIT_PX.scalePad * u), input.p, HIT_PX.scaleHandle * u);
  if (handle === null) return null;
  return { ...st, drag: { kind: "scale", before: st.session.model, refs: st.session.selection, handle, box, start: input.p } };
}

/** Corner: free; edge: one direction; Shift keeps the proportions. */
function scaleMove(st: EditorState, d: Extract<Drag, { kind: "scale" }>, input: PointerInput): EditorState {
  const f = scaleFor(d.handle, d.box, { dx: input.p.x - d.start.x, dy: input.p.y - d.start.y }, input.shift);
  return withSession(st, preview(st.session, scaleAnchors(d.before, d.refs, f)));
}

export function editorState(session: EditSession): EditorState {
  return { session, drag: null, snap: null, marquee: null };
}

function radii(u: number): HitRadii {
  return { anchor: HIT_PX.anchor * u, handle: HIT_PX.handle * u, segment: HIT_PX.segment * u };
}

const at = (m: PathModel, r: AnchorRef): Pt => m.subs[r.sub].anchors[r.i];
const hasRef = (list: readonly AnchorRef[], r: AnchorRef): boolean => list.some((x) => x.sub === r.sub && x.i === r.i);
const withSession = (st: EditorState, session: EditSession): EditorState => ({ ...st, session });

/** What is under the pointer among the SELECTED objects (others are not editable, only snappable). */
function hitOf(s: EditSession, input: PointerInput, selection: readonly AnchorRef[] = s.selection): Hit {
  return hitTest(s.model, input.p, { radii: radii(input.unitsPerPx), selected: selection, editable: (sub) => editableSub(s, sub) });
}

export function pointerDown(st: EditorState, input: PointerInput): EditorState {
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

/** A press on something: Ctrl toggles a point / inserts on a line, a handle starts a handle drag, else a move. */
function pressOn(st: EditorState, input: PointerInput, hit: Exclude<Hit, { kind: "none" }>): EditorState {
  const s = st.session;
  if (hit.kind === "handle") {
    const base = input.alt ? breakSmooth(s.model, hit.ref) : s.model;
    return { ...st, session: preview(s, base), drag: { kind: "handle", before: s.model, base, ref: hit.ref, side: hit.side } };
  }
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
  return { ...st, session: { ...s, selection: refs }, drag: anchorDrag(s.model, refs, refs[0], p) };
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
  if (d.kind === "handle") return withSession(st, preview(st.session, moveHandle(d.base, d.ref, d.side, input.p)));
  if (d.kind === "marquee") return marqueeMove(st, d, input.p);
  const a = at(d.base, d.ref);
  const far = Math.hypot(input.p.x - a.x, input.p.y - a.y) > HIT_PX.pull * input.unitsPerPx;
  return withSession(st, preview(st.session, far ? pullHandles(d.base, d.ref, input.p) : d.base));
}

/** Release: the gesture becomes one undo step (a plain click changed nothing and records nothing). */
export function pointerUp(st: EditorState): EditorState {
  const d = st.drag;
  const cleared = { ...st, drag: null, snap: null, marquee: null };
  if (d === null || d.kind === "marquee") return cleared;
  return { ...cleared, session: commit(st.session, st.session.model, d.before) };
}

/** Ctrl + click on a line (2026-11-06): an anchor is inserted there (the shape is kept). */
function insertAt(st: EditorState, hit: Extract<Hit, { kind: "segment" }>): EditorState {
  const ins = insertOnSegment(st.session.model, hit.sub, hit.i, hit.t);
  return ins === null ? st : withSession(st, { ...commit(st.session, ins.model), selection: [ins.ref] });
}

/** Double-click on a line (or one of its anchors) in Select selects all of that line's anchors (2026-11-06). */
export function doubleClick(st: EditorState, input: PointerInput): EditorState {
  const hit = hitOf(st.session, input, []);
  if (st.session.tool !== "select" || (hit.kind !== "segment" && hit.kind !== "anchor")) return st;
  const sub = hit.kind === "segment" ? hit.sub : hit.ref.sub;
  const selection = st.session.model.subs[sub].anchors.map((_, i) => ({ sub, i }));
  return withSession(st, { ...st.session, selection });
}

export interface KeyInput { key: string; ctrl: boolean; shift: boolean }

const removeSelected = (s: EditSession): EditSession =>
  (s.selection.length === 0 ? s : { ...commit(s, deleteAnchors(s.model, s.selection)), selection: [], active: null });

/** Ctrl + Delete: the line breaks at the selected points. */
const breakSelected = (s: EditSession): EditSession =>
  (s.selection.length === 0 ? s : { ...commit(s, breakAtAnchors(s.model, s.selection)), selection: [], active: null });

/** Esc ends a draw in progress, else clears the selected anchors, else the selected paths. */
function escape(s: EditSession): EditSession {
  if (s.active !== null) return { ...s, active: null };
  return s.selection.length > 0 ? { ...s, selection: [] } : { ...s, objects: [] };
}

/** One entry per key (with Ctrl, without): adding a key never deepens a branch chain. */
const CTRL_KEYS: Record<string, (s: EditSession, shift: boolean) => EditSession> = {
  z: (s, shift) => (shift ? redoSession(s) : undoSession(s)),
  y: (s) => redoSession(s),
  delete: (s) => breakSelected(s),
  backspace: (s) => breakSelected(s),
};
const PLAIN_KEYS: Record<string, (s: EditSession) => EditSession> = { delete: removeSelected, backspace: removeSelected, escape };

/** Keys: what they did, whether the editor used them, and whether Enter asked to finish. */
export function keyDown(st: EditorState, k: KeyInput): { state: EditorState; handled: boolean; finish: boolean } {
  const key = k.key.toLowerCase();
  if (!k.ctrl && key === "enter") return { state: st, handled: true, finish: true };
  const ctrl = k.ctrl ? CTRL_KEYS[key] : undefined;
  if (ctrl !== undefined) return { state: withSession(st, ctrl(st.session, k.shift)), handled: true, finish: false };
  const plain = k.ctrl ? undefined : PLAIN_KEYS[key];
  if (plain !== undefined) return { state: withSession(st, plain(st.session)), handled: true, finish: false };
  return { state: st, handled: false, finish: false };
}
