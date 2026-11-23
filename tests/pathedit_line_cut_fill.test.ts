// pathedit_line_cut_fill.test.ts — round-7 feature tests (2026-11-20):
// cutting bounded parts of filled objects by open lines, crossing lines
// ("lines by lines"), and overlapping fills ("fill by fill overlap"), as in
// ref image-11 (an open U-shaped arch curve crossing the bottom edge of a blue
// cloud highlights the bounded cap in red and cuts it out on Alt+Shift+click).
import { describe, expect, it } from "vitest";
import { editorState, hoverAt, pointerDown, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { paintedSubAt } from "../src/lib/pathedit/region";
import { loadObjects } from "../src/lib/pathedit/objects";
import { newSession, undoSession } from "../src/lib/pathedit/session";
import type { PathModel, Pt } from "../src/lib/pathedit/model";

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const both = { alt: true, shift: true };

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 1, target: null, ...mods });

const click = (st: EditorState, input: PointerInput): EditorState => pointerUp(pointerDown(st, input));

const painted = (m: PathModel, p: Pt, owner?: number): boolean =>
  paintedSubAt(m, p, owner === undefined ? () => true : (o) => o === owner) !== null;

/**
 * Ref image-11: blue cloud fill on top (y: 0..105, curved bottom) + black
 * stroked OPEN U-arch whose two ends hang in empty space at y = 135 while its
 * arch rises up to y ≈ 68 inside the blue fill, plus two open vertical ticks.
 */
const IMAGE_11_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160">`
  + `<path data-edit-path="0" fill="#1da1f2" d="M10 0L210 0L210 75C180 112 40 112 10 75Z"/>`
  + `<path data-edit-path="1" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" `
  + `d="M55 135C55 55 165 55 165 135 M85 110L85 135 M135 110L135 135"/>`
  + `</svg>`;

describe("cutting filled regions bounded by open lines, crossing lines, and overlapping fills (ref image-11)", () => {
  it("ref image-11: highlights and cuts the cap bounded by an OPEN arch curve and the fill's bottom edge", () => {
    const m0 = loadObjects(IMAGE_11_SVG, [IDENTITY, IDENTITY]);
    expect(m0.subs[1].closed).toBe(false); // U-arch is an OPEN subpath!
    expect(painted(m0, { x: 110, y: 88 }, 0)).toBe(true); // cap inside arch & cloud is painted before

    let st = editorState(newSession(m0, []));
    // Hovering Alt+Shift in the cap highlights ONLY that bounded cap (not the whole cloud!)
    const hovered = hoverAt(st, at(110, 88, both));
    expect(hovered.cutRegionHint).not.toBeNull();
    expect(Math.min(...hovered.cutRegionHint!.map((p) => p.y))).toBeGreaterThan(60); // bounded on top by the arch (~75), not y=0!

    // Hovering below the cloud (between the open legs of the U-arch) offers nothing
    expect(hoverAt(st, at(110, 120, both)).cutRegionHint ?? null).toBeNull();

    // Clicking Alt+Shift cuts ONLY that cap out of the blue cloud as one undo step
    st = click(hovered, at(110, 88, both));
    const m = st.session.model;
    expect(st.session.undo).toHaveLength(1);
    expect(painted(m, { x: 110, y: 88 }, 0)).toBe(false); // cap is cut out!
    expect(painted(m, { x: 110, y: 40 }, 0)).toBe(true);  // upper cloud above the arch remains blue!
    expect(painted(m, { x: 110, y: 120 }, 0)).toBe(false); // below cloud stays empty!
    expect(m.subs.filter((s) => s.owner === 1)).toHaveLength(3); // open arch + 2 ticks untouched!

    // Undo restores the cap cleanly
    expect(painted(undoSession(st.session).model, { x: 110, y: 88 }, 0)).toBe(true);
  });

  it("lets the user cut EITHER side of an open line that crosses all the way across a fill", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L110 10L110 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M0 60L120 60"/>`
      + `</svg>`;
    const base = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));

    const cutBottom = click(base, at(60, 85, both)).session.model;
    expect(painted(cutBottom, { x: 60, y: 85 }, 0)).toBe(false);
    expect(painted(cutBottom, { x: 60, y: 35 }, 0)).toBe(true);

    const cutTop = click(base, at(60, 35, both)).session.model;
    expect(painted(cutTop, { x: 60, y: 35 }, 0)).toBe(false);
    expect(painted(cutTop, { x: 60, y: 85 }, 0)).toBe(true);
  });

  it("cuts a wedge bounded by lines crossing lines + the fill edge", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 20L130 20L130 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M30 5L90 85"/>`
      + `<path data-edit-path="2" fill="none" stroke="#000" d="M110 5L50 85"/>`
      + `</svg>`;
    // The two open lines cross each other at (70, 58.33) and cross y=20 at x=41.25 and x=98.75,
    // enclosing a top triangle with centre ~(70, 35).
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY, IDENTITY]), []));
    st = click(st, at(70, 35, both));
    const m = st.session.model;
    expect(painted(m, { x: 70, y: 35 }, 0)).toBe(false);  // triangular wedge cut out
    expect(painted(m, { x: 25, y: 60 }, 0)).toBe(true);   // left side kept
    expect(painted(m, { x: 115, y: 60 }, 0)).toBe(true);  // right side kept
    expect(painted(m, { x: 70, y: 95 }, 0)).toBe(true);   // bottom below X-crossing kept
  });

  it("punches an interior hole enclosed purely by four crossing open lines (# grid inside a fill)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L190 10L190 190L10 190Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M40 70L160 70 M40 130L160 130 M70 40L70 160 M130 40L130 160"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(100, 100, both));
    const m = st.session.model;
    expect(painted(m, { x: 100, y: 100 }, 0)).toBe(false); // central [70..130, 70..130] cell punched out!
    expect(painted(m, { x: 50, y: 100 }, 0)).toBe(true);   // outside the # cell stays painted
    expect(painted(m, { x: 100, y: 50 }, 0)).toBe(true);
  });

  it("fill by fill overlap: cuts whichever individual cell (crescent or lens) is clicked", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L110 10L110 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="#0d8bd9" d="M70 20L170 20L170 100L70 100Z"/>`
      + `</svg>`;
    const base = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));

    // 1. Click in Fill 0 \ Fill 1 at (35, 60): removes ONLY Fill 0's left non-overlapping part
    const afterLeft = click(base, at(35, 60, both)).session.model;
    expect(painted(afterLeft, { x: 35, y: 60 })).toBe(false);
    expect(painted(afterLeft, { x: 90, y: 60 })).toBe(true);  // overlap [70..110] stays painted!
    expect(painted(afterLeft, { x: 140, y: 60 })).toBe(true); // Fill 1's right side stays painted!

    // 2. Click in Fill 0 ∩ Fill 1 at (90, 60): punches the overlap out of BOTH fills
    const afterOverlap = click(base, at(90, 60, both)).session.model;
    expect(painted(afterOverlap, { x: 90, y: 60 })).toBe(false);
    expect(painted(afterOverlap, { x: 35, y: 60 })).toBe(true);
    expect(painted(afterOverlap, { x: 140, y: 60 })).toBe(true);
  });

  it("cuts cleanly when an open line starts and ends directly ON the fill's edges (T-junction)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L110 10L110 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M10 60L110 60"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(60, 85, both));
    expect(painted(st.session.model, { x: 60, y: 85 }, 0)).toBe(false);
    expect(painted(st.session.model, { x: 60, y: 35 }, 0)).toBe(true);
  });

  it("ignores a dead-end open line that stops halfway inside a fill without enclosing a sub-part", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L110 10L110 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M0 60L60 60"/>`
      + `</svg>`;
    const st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    // Because the open line stops at x=60 without closing off a region, the hint
    // is the whole [10..110, 10..110] square (never an extrapolated half-slice).
    const hint = hoverAt(st, at(30, 85, both)).cutRegionHint!;
    expect(Math.min(...hint.map((p) => p.y))).toBeCloseTo(10, 1);
    expect(Math.max(...hint.map((p) => p.y))).toBeCloseTo(110, 1);
  });
});
