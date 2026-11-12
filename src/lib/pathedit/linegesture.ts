// linegesture.ts — the gestures that act on ONE line (2026-11-09; own file
// 2026-11-10; double-click 2026-11-10): Alt + click removes the segment under the pointer, Alt + Shift +
// click removes the part between the two crossings around the click, and while
// both keys are held over a line the part that would go is shown (cutHint).
// Each is one undo step; the old anchor picks are dropped because the anchors
// are renumbered. Pure state rules, like gesture.ts.

import type { EditorState, PointerInput } from "./gesture";
import type { Hit } from "./hit";
import { hitOf } from "./hitof";
import type { AnchorRef, Pt } from "./model";
import { removeSegment } from "./ops";
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

/** Alt + Shift + click on a line: the part between the two crossings around the click goes; anchors appear on the crossings. */
export function cutStretchAt(st: EditorState, hit: SegmentHit): EditorState {
  const m = st.session.model;
  const stretch = stretchAt(m, hit.sub, hit.i + hit.t);
  const model = stretch === null ? null : removeStretch(m, hit.sub, stretch);
  return model === null ? st : withEdit(st, commit(st.session, model));
}

const sameHint = (a: Pt[] | null | undefined, b: Pt[] | null): boolean =>
  a != null && b !== null && a.length === b.length && a[0].x === b[0].x && a[0].y === b[0].y
  && a[a.length - 1].x === b[b.length - 1].x && a[a.length - 1].y === b[b.length - 1].y;

/** The stretch an Alt + Shift click on the line under the pointer would remove, or null. */
function cutHintAt(s: EditSession, input: PointerInput): Pt[] | null {
  const hit = hitOf(s, input);
  const stretch = hit.kind === "segment" ? stretchAt(s.model, hit.sub, hit.i + hit.t) : null;
  return hit.kind === "segment" && stretch !== null ? stretchPoints(s.model, hit.sub, stretch) : null;
}

/** A pointer move with nothing held down: Alt + Shift over a line shows what would go; else the hint is cleared. The same state when nothing changes. */
export function hoverAt(st: EditorState, input: PointerInput): EditorState {
  const live = st.drag === null && st.session.tool === "select" && input.alt && input.shift;
  const hint = live ? cutHintAt(st.session, input) : null;
  if (hint === null && (st.cutHint ?? null) === null) return st;
  return sameHint(st.cutHint, hint) ? st : { ...st, cutHint: hint };
}

/** One whole line's anchors. */
const lineOf = (st: EditorState, sub: number): AnchorRef[] => st.session.model.subs[sub].anchors.map((_, i) => ({ sub, i }));

/** The selection a double-click makes: the line replaces it, Shift adds the line to it, Alt takes the line out of it. */
function lineSelection(st: EditorState, sub: number, input: PointerInput): AnchorRef[] {
  const kept = st.session.selection;
  if (input.alt) return kept.filter((r) => r.sub !== sub);
  if (!input.shift) return lineOf(st, sub);
  return [...kept, ...lineOf(st, sub).filter((r) => !kept.some((k) => k.sub === r.sub && k.i === r.i))];
}

/**
 * Double-click on a line (or one of its anchors) in Select selects that whole line (2026-11-06). With Shift it is
 * added to the selection, with Alt the whole line is excluded from it (2026-11-10). An Alt + click removes a segment,
 * so the removal made by this double-click's own first click is undone first (and no undo step is left behind).
 */
export function doubleClick(st: EditorState, input: PointerInput): EditorState {
  if (st.session.tool !== "select") return st;
  const base = input.alt && quick(st.lineCut, input.time) ? { ...st, session: st.lineCut.before, lineCut: null } : st;
  const hit = hitOf(base.session, input, []);
  if (hit.kind !== "segment" && hit.kind !== "anchor") return st; // nothing there: a removal, if any, stays
  const sub = hit.kind === "segment" ? hit.sub : hit.ref.sub;
  return { ...base, session: { ...base.session, selection: lineSelection(base, sub, input) } };
}
