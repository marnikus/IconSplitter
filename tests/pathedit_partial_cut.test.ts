// pathedit_partial_cut.test.ts — round-6 regression tests (2026-11-20):
// when a closed cutter only PARTLY overlaps a filled shape (ref image-9: a
// stroked magnifier circle hanging partly off the slanted edge of a blue card),
// Alt+Shift+click must subtract ONLY the overlapping part (Fill \ Cutter) —
// never appending an unclipped ring that inverts the unpainted outside crescent
// into fill.
import { describe, expect, it } from "vitest";
import { editorState, hoverAt, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { paintedSubAt, regionAt } from "../src/lib/pathedit/region";
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

/** Cubic-Bezier circle centred at (cx, cy) with radius r (4 segments, κ ≈ 0.55228475). */
function circlePath(cx: number, cy: number, r: number): string {
  const k = +(r * 0.55228475).toFixed(3);
  return `M${cx} ${cy - r}`
    + `C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}`
    + `C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}`
    + `C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}`
    + `C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}Z`;
}

/**
 * Ref image-9: blue slanted card (x: 0..210 at top, 0..150 at bottom, y: 0..240)
 * + black stroked circle centred at (130, 120) radius 80:
 *   - at y = 120 the card's slanted right edge is at x = 180, while the circle
 *     reaches x = 210 → (195, 120) is INSIDE the circle but OUTSIDE the blue card!
 */
function image9Svg(fillRule: "evenodd" | "nonzero" = "evenodd"): string {
  const ruleAttr = fillRule === "evenodd" ? ' fill-rule="evenodd"' : "";
  const circle = circlePath(130, 120, 80);
  const bars = " M90 170L90 115L110 115L110 170 M135 170L135 80L155 80L155 170";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 240">`
    + `<path data-edit-path="0" fill="#1da1f2"${ruleAttr} d="M0 0L210 0L150 240L0 240Z"/>`
    + `<path data-edit-path="1" fill="none" stroke="#000" stroke-width="4" d="${circle}${bars}"/>`
    + `</svg>`;
}

describe("boolean region cut on a partially overlapping closed shape (ref image-9)", () => {
  it("cuts ONLY the overlapping part on an evenodd fill — never inverting the outside crescent", () => {
    const m0 = loadObjects(image9Svg("evenodd"), [IDENTITY, IDENTITY]);
    expect(painted(m0, { x: 120, y: 120 }, 0)).toBe(true);   // inside circle & card: blue before
    expect(painted(m0, { x: 195, y: 120 }, 0)).toBe(false);  // right crescent of circle: empty before

    let st = editorState(newSession(m0, []));
    // Hovering the unpainted right crescent of the circle offers nothing
    expect(regionAt(m0, { x: 195, y: 120 })).toBeNull();
    expect(hoverAt(st, at(195, 120, both)).cutRegionHint ?? null).toBeNull();

    // Hovering the painted part of the circle clips the red preview to the card's slanted edge
    const hovered = hoverAt(st, at(120, 120, both));
    expect(hovered.cutRegionHint).not.toBeNull();
    expect(Math.max(...hovered.cutRegionHint!.map((p) => p.x))).toBeLessThan(205);

    // Alt+Shift+click cuts the overlapping part out as one undo step
    st = click(hovered, at(120, 120, both));
    const m = st.session.model;
    expect(st.session.undo).toHaveLength(1);
    expect(painted(m, { x: 120, y: 120 }, 0)).toBe(false);   // overlap is now empty
    expect(painted(m, { x: 195, y: 120 }, 0)).toBe(false);   // outside crescent stays empty (NO invert!)
    expect(painted(m, { x: 25, y: 120 }, 0)).toBe(true);     // card left of circle stays blue
    expect(painted(m, { x: 190, y: 15 }, 0)).toBe(true);     // card top-right above circle stays blue
    expect(painted(m, { x: 135, y: 225 }, 0)).toBe(true);    // card bottom below circle stays blue

    // Cut edge keeps real cubic Bezier curves, and stroked path (circle + bars) is untouched
    const cardSubs = m.subs.filter((s) => s.owner === 0);
    expect(cardSubs.some((s) => s.anchors.some((a) => a.in !== null || a.out !== null))).toBe(true);
    expect(m.subs.filter((s) => s.owner === 1)).toHaveLength(3); // circle + 2 bar strokes intact

    // Undo restores the original model cleanly
    expect(painted(undoSession(st.session).model, { x: 120, y: 120 }, 0)).toBe(true);
  });

  it("cuts ONLY the overlapping part on a nonzero fill too (no negative-winding spill outside)", () => {
    const m0 = loadObjects(image9Svg("nonzero"), [IDENTITY, IDENTITY]);
    let st = editorState(newSession(m0, []));
    st = click(st, at(120, 120, both));
    const m = st.session.model;
    expect(painted(m, { x: 120, y: 120 }, 0)).toBe(false);
    expect(painted(m, { x: 195, y: 120 }, 0)).toBe(false);   // nonzero -1 winding would have painted here!
    expect(painted(m, { x: 25, y: 120 }, 0)).toBe(true);
  });

  it("splits a filled bar cleanly into two separate pieces when the cutter crosses both edges", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 40L230 40L230 80L10 80Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="${circlePath(120, 60, 35)}"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(120, 60, both));
    const m = st.session.model;
    expect(painted(m, { x: 120, y: 60 }, 0)).toBe(false);    // middle cut out
    expect(painted(m, { x: 120, y: 30 }, 0)).toBe(false);    // above bar inside circle stays empty
    expect(painted(m, { x: 120, y: 90 }, 0)).toBe(false);    // below bar inside circle stays empty
    expect(painted(m, { x: 40, y: 60 }, 0)).toBe(true);      // left piece intact
    expect(painted(m, { x: 200, y: 60 }, 0)).toBe(true);     // right piece intact
    expect(m.subs.filter((s) => s.owner === 0)).toHaveLength(2);
  });

  it("handles a cutter that shares collinear top/bottom edges AND protrudes past the right edge", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 120">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 10L110 10L110 110L10 110Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M60 10L140 10L140 110L60 110Z"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(85, 60, both));
    const m = st.session.model;
    expect(painted(m, { x: 35, y: 60 }, 0)).toBe(true);      // left half [10..60] kept
    expect(painted(m, { x: 85, y: 60 }, 0)).toBe(false);     // overlap [60..110] removed
    expect(painted(m, { x: 125, y: 60 }, 0)).toBe(false);    // outside protrusion [110..140] stays empty!
  });

  it("merges a cut overlapping an existing hole on an evenodd fill without re-painting the overlap", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
      + `<path data-edit-path="0" fill="#1da1f2" fill-rule="evenodd" `
      + `d="M10 10L190 10L190 190L10 190Z M40 60L110 60L110 140L40 140Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="M80 60L150 60L150 140L80 140Z"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    expect(painted(st.session.model, { x: 95, y: 100 }, 0)).toBe(false); // [40..110] is already a hole
    st = click(st, at(130, 100, both));                       // punch overlapping right box [80..150]
    const m = st.session.model;
    expect(painted(m, { x: 60, y: 100 }, 0)).toBe(false);     // left hole stays empty
    expect(painted(m, { x: 95, y: 100 }, 0)).toBe(false);     // OVERLAP [80..110] stays empty (no XOR refill!)
    expect(painted(m, { x: 130, y: 100 }, 0)).toBe(false);    // right [110..150] is empty
    expect(painted(m, { x: 25, y: 100 }, 0)).toBe(true);      // surrounding frame stays blue
  });

  it("picks a partial cutter even when its total area is larger than the filled shape", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160">`
      + `<path data-edit-path="0" fill="#1da1f2" d="M10 40L90 40L90 120L10 120Z"/>` // area 6,400
      + `<path data-edit-path="1" fill="none" stroke="#000" d="${circlePath(120, 80, 60)}"/>` // area ~11,310
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(75, 80, both)); // inside overlap x ∈ [60..90]
    const m = st.session.model;
    expect(painted(m, { x: 75, y: 80 }, 0)).toBe(false);     // overlap cut out
    expect(painted(m, { x: 30, y: 80 }, 0)).toBe(true);      // left side of square WAS NOT erased!
    expect(painted(m, { x: 140, y: 80 }, 0)).toBe(false);    // outside right side of circle stays empty
  });

  it("keeps a two-arc curved crescent valid (>= 3 anchors) when one circle cuts another", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
      + `<path data-edit-path="0" fill="#1da1f2" d="${circlePath(80, 100, 50)}"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="${circlePath(120, 100, 50)}"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(95, 100, both));
    const m = st.session.model;
    expect(painted(m, { x: 50, y: 100 }, 0)).toBe(true);     // crescent moon remains painted
    expect(painted(m, { x: 95, y: 100 }, 0)).toBe(false);    // lens overlap cut out
    expect(painted(m, { x: 150, y: 100 }, 0)).toBe(false);   // outside right moon stays empty
  });

  it("cuts a native <circle fill='none'/> partly hanging off a polygon edge cleanly", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">`
      + `<path data-edit-path="0" fill="#1da1f2" fill-rule="evenodd" d="M10 10L170 10L140 230L10 230Z"/>`
      + `<circle data-edit-path="1" cx="130" cy="120" r="65" fill="none" stroke="#000" stroke-width="4"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY]), []));
    st = click(st, at(115, 120, both));
    const m = st.session.model;
    expect(painted(m, { x: 115, y: 120 }, 0)).toBe(false);   // overlap removed
    expect(painted(m, { x: 180, y: 120 }, 0)).toBe(false);   // right overhang stays empty
    expect(painted(m, { x: 35, y: 120 }, 0)).toBe(true);     // left card intact
  });

  it("preserves an interior hole AND carries it along when dragging after a partial edge cut", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 240">`
      + `<path data-edit-path="0" fill="#1da1f2" fill-rule="evenodd" d="M20 10L210 10L160 230L20 230Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" d="${circlePath(65, 65, 18)}"/>`
      + `<path data-edit-path="2" fill="none" stroke="#000" d="${circlePath(145, 130, 70)}"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(svg, [IDENTITY, IDENTITY, IDENTITY]), []));
    st = click(st, at(65, 65, both));                         // 1. punch interior hole at (65, 65)
    st = click(st, at(130, 130, both));                       // 2. cut partial edge circle at (145, 130)
    expect(painted(st.session.model, { x: 65, y: 65 }, 0)).toBe(false);
    expect(painted(st.session.model, { x: 130, y: 130 }, 0)).toBe(false);
    expect(painted(st.session.model, { x: 200, y: 130 }, 0)).toBe(false); // outside crescent empty!
    // 3. Drag painted card +30 right: interior hole moves 65 → 95 with the clipped card
    st = pointerDown(st, at(40, 180, { target: 0 }));
    st = pointerMove(st, at(70, 180, { target: 0 }));
    st = pointerUp(st);
    expect(painted(st.session.model, { x: 95, y: 65 }, 0)).toBe(false);  // hole moved 65 → 95
    expect(painted(st.session.model, { x: 65, y: 65 }, 0)).toBe(true);   // card body now covers (65, 65)
  });
});
