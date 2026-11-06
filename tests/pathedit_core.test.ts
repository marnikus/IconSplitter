// pathedit_core.test.ts — the in-preview SVG path editor's pure core
// (2026-11-06): the anchor model and its M/L/C/Z writer, the edit operations,
// hit testing and Shift-snap, the session, the pointer/key state machine, and
// the file rewrite that changes one path's `d` and nothing else.
import { describe, expect, it } from "vitest";
import { cubicAt, fromPathData, modeOf, segmentCubic, toPathData, type PathModel } from "../src/lib/pathedit/model";
import {
  addAnchor, closeSubpath, deleteAnchors, insertOnSegment, joinSubpaths, moveAnchors, moveHandle, toggleSmooth,
} from "../src/lib/pathedit/ops";
import { anchorsInRect, hitTest, snapPoint } from "../src/lib/pathedit/hit";
import { isDirty, newSession, setTool } from "../src/lib/pathedit/session";
import { doubleClick, editorState, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { annotatePaths, pathTags, withPathD } from "../src/lib/pathedit/svgdoc";

const R = { anchor: 1, handle: 1, segment: 1 };
const input = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput => ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, ...mods });
const drag = (st: EditorState, from: [number, number], to: [number, number], mods: Partial<PointerInput> = {}): EditorState =>
  pointerUp(pointerMove(pointerDown(st, input(...from, mods)), input(...to, mods)));

describe("the point model", () => {
  it("round-trips lines and closes with Z", () => {
    expect(toPathData(fromPathData("M10 10 L20 10 L20 20 Z"))).toBe("M10 10L20 10L20 20Z");
    expect(toPathData(fromPathData("M0 0 H10 V10"))).toBe("M0 0L10 0L10 10");
  });

  it("reads relative commands, quadratics and arcs as absolute cubics", () => {
    const m = fromPathData("m1 1 l9 0 q5 5 0 10 a5 5 0 0 1 -5 -5");
    expect(m.subs[0].anchors.map((a) => [Math.round(a.x), Math.round(a.y)])).toEqual([[1, 1], [10, 1], [10, 11], [5, 6]]);
    expect(toPathData(m)).toMatch(/^M1 1L10 1C.*C/);
  });

  it("merges a closing anchor into the first one, keeping its incoming handle", () => {
    const m = fromPathData("M0 0 C 0 -5 10 -5 10 0 C 10 5 0 5 0 0 Z");
    expect(m.subs[0].anchors).toHaveLength(2);
    expect(m.subs[0].anchors[0].in).toEqual({ x: 0, y: 5 });
    expect(toPathData(m)).toBe("M0 0C0 -5 10 -5 10 0C10 5 0 5 0 0Z");
  });

  it("knows corner, smooth (mirrored, same length) and broken points", () => {
    expect(modeOf({ x: 0, y: 0, in: null, out: null })).toBe("corner");
    expect(modeOf({ x: 0, y: 0, in: { x: -2, y: 0 }, out: { x: 2, y: 0 } })).toBe("smooth");
    expect(modeOf({ x: 0, y: 0, in: { x: -2, y: 0 }, out: { x: 0, y: 3 } })).toBe("broken");
    expect(modeOf({ x: 0, y: 0, in: null, out: { x: 0, y: 3 } })).toBe("broken");
  });

  it("writes a one-sided curve with the missing handle on its anchor, at 2 decimals", () => {
    const m: PathModel = { subs: [{ closed: false, anchors: [
      { x: 0, y: 0, in: null, out: { x: 1.23456, y: 0 }, mode: "broken" },
      { x: 5, y: 5, in: null, out: null, mode: "corner" },
    ] }] };
    expect(toPathData(m)).toBe("M0 0C1.23 0 5 5 5 5");
  });
});

describe("edit operations", () => {
  const line = () => fromPathData("M0 0 L30 0 L30 30");

  it("moving an anchor carries its handles", () => {
    const m = fromPathData("M0 0 C 5 0 10 5 10 10");
    const moved = moveAnchors(m, [{ sub: 0, i: 1 }], 1, 2).subs[0].anchors[1];
    expect([moved.x, moved.y, moved.in]).toEqual([11, 12, { x: 11, y: 7 }]);
  });

  it("a smooth handle mirrors at the same length; a broken one moves alone", () => {
    const smooth = toggleSmooth(line(), { sub: 0, i: 1 });
    const a = moveHandle(smooth, { sub: 0, i: 1 }, "out", { x: 40, y: 5 }).subs[0].anchors[1];
    expect(a.in).toEqual({ x: 20, y: -5 });
    const broken = { subs: [{ ...smooth.subs[0], anchors: smooth.subs[0].anchors.map((x, i) => (i === 1 ? { ...x, mode: "broken" as const } : x)) }] };
    const b = moveHandle(broken, { sub: 0, i: 1 }, "out", { x: 40, y: 5 }).subs[0].anchors[1];
    expect(b.in).toEqual(smooth.subs[0].anchors[1].in);
  });

  it("Ctrl-click adds a smooth pair a third of the shorter neighbour long, and removes it again", () => {
    const m = toggleSmooth(fromPathData("M0 0 L30 0 L30 60"), { sub: 0, i: 1 });
    const a = m.subs[0].anchors[1];
    expect(a.mode).toBe("smooth");
    expect(Math.hypot(a.out!.x - a.x, a.out!.y - a.y)).toBeCloseTo(10);
    expect([a.x, a.y]).toEqual([30, 0]); // never moves
    const back = toggleSmooth(m, { sub: 0, i: 1 }).subs[0].anchors[1];
    expect([back.mode, back.in, back.out]).toEqual(["corner", null, null]);
    const end = toggleSmooth(line(), { sub: 0, i: 0 }).subs[0].anchors[0];
    expect(end.out!.y).toBeCloseTo(0); // an endpoint aims along its one segment
  });

  it("delete: endpoints shorten, a two-point path goes, a closed path stays closed with three", () => {
    expect(toPathData(deleteAnchors(line(), [{ sub: 0, i: 0 }]))).toBe("M30 0L30 30");
    expect(deleteAnchors(fromPathData("M0 0 L5 5"), [{ sub: 0, i: 1 }]).subs).toHaveLength(0);
    const square = fromPathData("M0 0 L10 0 L10 10 L0 10 Z");
    expect(deleteAnchors(square, [{ sub: 0, i: 3 }]).subs[0].closed).toBe(true);
    expect(deleteAnchors(square, [{ sub: 0, i: 3 }, { sub: 0, i: 2 }]).subs[0].closed).toBe(false);
  });

  it("insert on a curve keeps the shape", () => {
    const m = fromPathData("M0 0 C 0 10 20 10 20 0");
    const before = segmentCubic(m.subs[0], 0)!;
    const ins = insertOnSegment(m, 0, 0, 0.3)!;
    expect(ins.model.subs[0].anchors).toHaveLength(3);
    const left = segmentCubic(ins.model.subs[0], 0)!;
    const p = cubicAt(left, 0.5);
    const q = cubicAt(before, 0.15);
    expect(p.x).toBeCloseTo(q.x);
    expect(p.y).toBeCloseTo(q.y);
  });

  it("draw adds, closes and joins", () => {
    let r = addAnchor({ subs: [] }, null, { x: 0, y: 0 });
    r = addAnchor(r.model, r.ref.sub, { x: 10, y: 0 });
    r = addAnchor(r.model, r.ref.sub, { x: 10, y: 10 });
    expect(toPathData(closeSubpath(r.model, 0))).toBe("M0 0L10 0L10 10Z");
    const two = { subs: [...r.model.subs, ...fromPathData("M20 20 L30 30").subs] };
    const joined = joinSubpaths(two, 0, { sub: 1, i: 1 })!;
    expect(toPathData(joined.model)).toBe("M0 0L10 0L10 10L30 30L20 20");
  });
});

describe("hit testing and snap", () => {
  it("a selected point's handle wins over an anchor under it; segments are hit by a band", () => {
    const m = toggleSmooth(fromPathData("M0 0 L3 0 L6 0"), { sub: 0, i: 1 });
    expect(hitTest(m, { x: 4, y: 0 }, { radii: R, selected: [{ sub: 0, i: 1 }] }).kind).toBe("handle");
    expect(hitTest(m, { x: 3, y: 0 }, { radii: R, selected: [] }).kind).toBe("anchor");
    expect(hitTest(fromPathData("M0 0 L100 0"), { x: 50, y: 0.5 }, { radii: R, selected: [] }).kind).toBe("segment");
    expect(hitTest(fromPathData("M0 0 L100 0"), { x: 50, y: 5 }, { radii: R, selected: [] }).kind).toBe("none");
  });

  it("snaps to a line end first, then onto a segment, never to itself or its own segments", () => {
    const m = fromPathData("M0 0 L100 0 M50 50 L60 60");
    expect(snapPoint(m, { x: 99, y: 1 }, { sub: 1, i: 0 }, 3)).toMatchObject({ kind: "end", pt: { x: 100, y: 0 } });
    expect(snapPoint(m, { x: 40, y: 2 }, { sub: 1, i: 0 }, 3)).toMatchObject({ kind: "segment", pt: { x: 40, y: 0 } });
    expect(snapPoint(m, { x: 55, y: 55 }, { sub: 1, i: 0 }, 3)).toBeNull(); // its own segment
  });

  it("the marquee selects the anchors inside it", () => {
    expect(anchorsInRect(fromPathData("M0 0 L10 0 L20 0"), { x: 5, y: -1 }, { x: 25, y: 1 })).toEqual([{ sub: 0, i: 1 }, { sub: 0, i: 2 }]);
  });
});

describe("pointer and keys", () => {
  const start = (d = "M0 0 L10 0 L10 10") => editorState(newSession(fromPathData(d)));

  it("a drag is one undo step; Ctrl+Z / Ctrl+Y step through it", () => {
    const st = drag(start(), [10, 0], [12, 3]);
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ x: 12, y: 3 });
    expect(st.session.undo).toHaveLength(1);
    const undone = keyDown(st, { key: "z", ctrl: true, shift: false }).state;
    expect(undone.session.model.subs[0].anchors[1]).toMatchObject({ x: 10, y: 0 });
    expect(keyDown(undone, { key: "y", ctrl: true, shift: false }).state.session.model.subs[0].anchors[1]).toMatchObject({ x: 12, y: 3 });
  });

  it("a plain click selects and records nothing; Finish is off until something changed", () => {
    const st = pointerUp(pointerDown(start(), input(10, 0)));
    expect(st.session.selection).toEqual([{ sub: 0, i: 1 }]);
    expect(st.session.undo).toHaveLength(0);
    expect(isDirty(st.session)).toBe(false);
  });

  it("Shift snaps the grabbed anchor onto another path's end", () => {
    const st = drag(start("M0 0 L10 0 M30 30 L40 40"), [10, 0], [29.5, 29.6], { shift: true });
    expect(st.session.model.subs[0].anchors[1]).toMatchObject({ x: 30, y: 30 });
  });

  it("Ctrl+click toggles smooth; Alt-drag on a smooth handle breaks the mirror", () => {
    let st = pointerUp(pointerDown(start("M0 0 L30 0 L30 60"), input(30, 0, { ctrl: true })));
    const a = st.session.model.subs[0].anchors[1];
    expect(a.mode).toBe("smooth");
    st = drag(st, [a.out!.x, a.out!.y], [40, 20], { alt: true });
    const b = st.session.model.subs[0].anchors[1];
    expect(b.mode).toBe("broken");
    expect(b.in).toEqual(a.in);
    expect(st.session.undo).toHaveLength(2);
  });

  it("marquee + Delete removes every selected anchor in one step", () => {
    let st = drag(start("M0 0 L10 0 L20 0 L30 0"), [5, -5], [25, 5]);
    expect(st.session.selection).toHaveLength(2);
    st = keyDown(st, { key: "Delete", ctrl: false, shift: false }).state;
    expect(toPathData(st.session.model)).toBe("M0 0L30 0");
  });

  it("Draw: click adds a corner, a drag pulls a smooth pair, the first anchor closes", () => {
    let st: EditorState = { ...start(""), session: setTool(newSession({ subs: [] }), "draw") };
    st = pointerUp(pointerDown(st, input(0, 0)));
    st = drag(st, [20, 0], [25, 5]);
    st = pointerUp(pointerDown(st, input(20, 20)));
    expect(st.session.model.subs[0].anchors[1].mode).toBe("smooth");
    st = pointerUp(pointerDown(st, input(0, 0)));
    expect(st.session.model.subs[0].closed).toBe(true);
  });

  it("Esc ends the open path (the next click starts a new one); Enter asks to finish", () => {
    let st: EditorState = { ...start(""), session: setTool(newSession({ subs: [] }), "draw") };
    st = pointerUp(pointerDown(st, input(0, 0)));
    st = keyDown(st, { key: "Escape", ctrl: false, shift: false }).state;
    st = pointerUp(pointerDown(st, input(50, 50)));
    expect(st.session.model.subs).toHaveLength(2);
    expect(keyDown(st, { key: "Enter", ctrl: false, shift: false }).finish).toBe(true);
  });

  it("double-click on a segment inserts an anchor in Select", () => {
    const st = doubleClick(start("M0 0 L100 0"), input(40, 0));
    expect(st.session.model.subs[0].anchors).toHaveLength(3);
  });
});

describe("the file around the path", () => {
  const svg = '<svg viewBox="0 0 24 24" stroke-width="2"><!-- <path d="M9 9"/> --><path fill="none" d="M0 0L1 1"/><path d=\'M5 5\' stroke="red"/></svg>';

  it("finds paths in order, skipping comments", () => {
    expect(pathTags(svg).map((t) => t.d)).toEqual(["M0 0L1 1", "M5 5"]);
  });

  it("rewrites only that path's d; everything else stays byte for byte", () => {
    const out = withPathD(svg, 1, "M6 6L7 7")!;
    expect(out).toBe(svg.replace("d='M5 5'", 'd="M6 6L7 7"'));
    expect(withPathD(svg, 5, "M0 0")).toBeNull();
  });

  it("tags the preview copy so a click names its path", () => {
    expect(annotatePaths(svg)).toContain('<path data-edit-path="1" d=\'M5 5\'');
    expect(annotatePaths(svg)).toContain('<!-- <path d="M9 9"/> -->');
  });
});
