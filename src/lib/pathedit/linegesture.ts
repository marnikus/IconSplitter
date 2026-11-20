// linegesture.ts — the gestures that act on ONE line (2026-11-09; own file
// 2026-11-10; double-click 2026-11-10): Alt + click removes the segment under the pointer, Alt + Shift +
// click removes the part between the two crossings around the click, and while
// both keys are held over a line the part that would go is shown (cutHint).
// Each is one undo step; the old anchor picks are dropped because the anchors
// are renumbered. Pure state rules, like gesture.ts.

import { pieceAnchors } from "./fill";
import type { EditorState, PointerInput } from "./gesture";
import type { Hit } from "./hit";
import { hitOf } from "./hitof";
import type { AnchorRef, Pt } from "./model";
import { removeSegment } from "./ops";
import { cellHintAt, cutCellAt } from "./planarface";
import { paintedSubAt } from "./region";
import { commit, type EditSession } from "./session";
import { removeStretch, stretchAt, stretchPoints } from "./stretch";

type SegmentHit = Extract<Hit, { kind: "segment" }>;

const withEdit = (st: EditorState, session: EditSession): EditorState => ({ ...st, session: { ...session, selection: [], active: null } });

/** Clicks closer together than this make a double-click. */
const DOUBLE_MS = 800;

const quick = (cut: EditorState["lineCut"], time: number | undefined): cut is NonNullable<EditorState["lineCut"]> =>
  cut != null && time !== undefined && time - cut.at <= DOUBLE_MS;

/**
 * Alt + click on a line: just that segment goes, the rest stays. The session before it is kept for a moment:
 * an Alt + double-click is an exclusion, so its first click's removal is taken back (see doubleClick).
 */
export function removeAt(st: EditorState, hit: SegmentHit, time?: number): EditorState {
  const model = removeSegment(st.session.model, hit.sub, hit.i);
  if (model === null) return st;
  const before = quick(st.lineCut, time) ? st.lineCut.before : st.session; // a quick second removal keeps the first one's start
  return { ...withEdit(st, commit(st.session, model)), lineCut: time === undefined ? null : { at: time, before } };
}

/**
 * Alt + Shift + click on a FILLED area (2026-11-20): the region's winding flips,
 * so the paint inside it becomes a hole. Nothing is recorded when the point is
 * outside every closed shape — the click then selects as usual.
 */
export function cutRegionAt(st: EditorState, p: Pt): EditorState {
  const model = cutCellAt(st.session.model, p);
  if (model === null) return st;
  return withEdit(st, commit(st.session, model));
}

/** The closed outline a click would cut out, or null: the red mark of a fill region. */
function regionHintAt(s: EditSession, p: Pt): Pt[] | null {
  return cellHintAt(s.model, p);
}

const isStretchLine = (s: EditSession, sub: number): boolean => {
  const item = s.model.subs[sub];
  return item !== undefined && (!item.closed || item.paints === false);
};

/** Segment hit on an open line or stroke-only shape that actually has a crossing stretch, or null. */
export function lineStretchHit(s: EditSession, input: PointerInput): SegmentHit | null {
  const hit = hitOf(s, input);
  if (hit.kind !== "segment" || !isStretchLine(s, hit.sub)) return null;
  return stretchAt(s.model, hit.sub, hit.i + hit.t) === null ? null : hit;
}

/** Alt + Shift + click on a line: the part between the two crossings around the click goes; anchors appear on the crossings. */
export function cutStretchAt(st: EditorState, hit: SegmentHit): EditorState {
  if (!isStretchLine(st.session, hit.sub)) return st;
  const m = st.session.model;
  const stretch = stretchAt(m, hit.sub, hit.i + hit.t);
  const model = stretch === null ? null : removeStretch(m, hit.sub, stretch);
  return model === null ? st : withEdit(st, commit(st.session, model));
}

const sameHint = (a: Pt[] | null | undefined, b: Pt[] | null): boolean => {
  const x = a ?? null;
  if (x === null || b === null) return x === b;
  if (x.length !== b.length || x.length < 2) return false;
  const end = b.length - 1;
  return x[0].x === b[0].x && x[0].y === b[0].y && x[end].x === b[end].x && x[end].y === b[end].y;
};

/** The stretch an Alt + Shift click on the line under the pointer would remove, or null. */
function cutHintAt(s: EditSession, input: PointerInput): Pt[] | null {
  const hit = lineStretchHit(s, input);
  if (hit === null) return null;
  const stretch = stretchAt(s.model, hit.sub, hit.i + hit.t);
  return stretch === null ? null : stretchPoints(s.model, hit.sub, stretch);
}

/**
 * A pointer move with nothing held down: Alt + Shift over a line shows the part
 * that would go, over a FILLED area the outline that would be cut out (the line
 * wins when both are under the pointer); otherwise both marks are cleared. The
 * same state when nothing changes.
 */
export function hoverAt(st: EditorState, input: PointerInput): EditorState {
  const live = st.drag === null && st.session.tool === "select" && input.alt && input.shift;
  const hint = live ? cutHintAt(st.session, input) : null;
  const region = live && hint === null ? regionHintAt(st.session, input.p) : null;
  const same = sameHint(st.cutHint, hint) && sameRegion(st.cutRegionHint, region);
  return same ? st : { ...st, cutHint: hint, cutRegionHint: region };
}

const sameRegion = (a: Pt[] | null | undefined, b: Pt[] | null): boolean =>
  (a ?? null) === null && b === null ? true : a != null && b !== null && a.length === b.length && sameHint(a, b);

/** One whole line's (or filled piece's, holes included) anchors. */
const lineOf = (st: EditorState, sub: number): AnchorRef[] => pieceAnchors(st.session.model, sub);

/** The selection a double-click makes: the piece replaces it, Shift adds it, Alt takes that one ring out of it. */
function lineSelection(st: EditorState, sub: number, input: PointerInput): AnchorRef[] {
  const kept = st.session.selection;
  if (input.alt) return kept.filter((r) => r.sub !== sub);
  const piece = lineOf(st, sub);
  if (!input.shift) return piece;
  return [...kept, ...piece.filter((r) => !kept.some((k) => k.sub === r.sub && k.i === r.i))];
}

function doubleClickSub(s: EditSession, input: PointerInput): number | null {
  const hit = hitOf(s, input, []);
  if (hit.kind === "segment") return hit.sub;
  if (hit.kind === "anchor") return hit.ref.sub;
  if (input.alt) return null;
  return paintedSubAt(s.model, input.p, (o) => o === undefined || s.objects.includes(o)) ?? paintedSubAt(s.model, input.p);
}

function includeOwner(objects: readonly number[], owner: number | undefined, additive: boolean): number[] {
  if (owner === undefined || objects.includes(owner)) return [...objects];
  return additive ? [...objects, owner] : [owner];
}

/**
 * Double-click on a line (or one of its anchors, or inside a painted fill) in Select selects that whole line / filled
 * piece (holes included, 2026-11-20). With Shift it is added to the selection, with Alt that single ring is excluded.
 * An Alt + click removes a segment, so the removal made by this double-click's own first click is undone first.
 */
export function doubleClick(st: EditorState, input: PointerInput): EditorState {
  if (st.session.tool !== "select") return st;
  const base = input.alt && quick(st.lineCut, input.time) ? { ...st, session: st.lineCut.before, lineCut: null } : st;
  const sub = doubleClickSub(base.session, input);
  if (sub === null) return st; // nothing there: a removal, if any, stays
  const objects = includeOwner(base.session.objects, base.session.model.subs[sub]?.owner, input.shift);
  return { ...base, session: { ...base.session, objects, selection: lineSelection(base, sub, input) } };
}
