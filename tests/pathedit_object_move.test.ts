// pathedit_object_move.test.ts — after a boolean region cut (`Alt+Shift+Click`),
// the hole is part of the fill — ONE object overall (2026-11-20, fifth round).
// Shifting or transforming the fill (dragging the painted fill directly, or
// double-clicking its outline / interior to drag, arrow-nudge, scale or rotate)
// must carry every hole of that fill with it, never leaving the hole behind as
// an unwanted stationary mask while leaving separate stroke paths untouched.
import { describe, expect, it } from "vitest";
import {
  doubleClick, editorState, keyDown, pointerDown, pointerMove, pointerUp,
  type EditorState, type PointerInput,
} from "../src/lib/pathedit/gesture";
import { IDENTITY, type PathModel, type Pt } from "../src/lib/pathedit/model";
import { loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { regionAt, regionPoints } from "../src/lib/pathedit/region";
import { newSession } from "../src/lib/pathedit/session";

/** Reproduces the user's icon: a blue fill path behind black stroked line-art (magnifying glass + person head circle). */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">`
  + `<path fill="#28ACEE" d="M80 40L240 40L240 260L80 260Z"/>`
  + `<path fill="none" stroke="#000" stroke-width="4" d="M160 110C182 110 200 128 200 150C200 172 182 190 160 190C138 190 120 172 120 150C120 128 138 110 160 110Z"/>`
  + `<path fill="none" stroke="#000" stroke-width="4" d="M160 135C168 135 175 142 175 150C175 158 168 165 160 165C152 165 145 158 145 150C145 142 152 135 160 135Z"/>`
  + `</svg>`;
const MATS = [IDENTITY, IDENTITY, IDENTITY];

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.2, target: null, ...mods });
const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));
const drag = (st: EditorState, a: PointerInput, b: PointerInput) => pointerUp(pointerMove(pointerDown(st, a), b));

/** Nonzero paint of `owner` at `p`: 0 means unpainted (empty or a hole), non-zero means painted. */
function paintedBy(m: PathModel, owner: number, p: Pt): boolean {
  let winding = 0;
  let count = 0;
  let rule: "evenodd" | "nonzero" = "nonzero";
  for (const s of m.subs) {
    if (s.owner !== owner || s.paints === false || !s.closed || s.anchors.length < 3) continue;
    if (s.fillRule === "evenodd") rule = "evenodd";
    const poly = regionPoints(s);
    let hit = false;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      area += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) hit = !hit;
    }
    if (hit) { winding += Math.sign(area); count += 1; }
  }
  return rule === "evenodd" ? count % 2 === 1 : winding !== 0;
}

/** Starts the icon, cuts the head-circle hole `(160, 150)` out of the blue fill, and selects the fill. */
function cutHeadHole(source = ICON): EditorState {
  const st0 = editorState(newSession(loadObjects(source, MATS), []));
  const cut = click(st0, at(160, 150, { alt: true, shift: true }));
  expect(paintedBy(cut.session.model, 0, { x: 160, y: 150 })).toBe(false); // head circle is now a hole
  expect(paintedBy(cut.session.model, 0, { x: 100, y: 150 })).toBe(true);  // surrounding blue fill paints
  return cut;
}

describe("a hole cut out of a fill belongs to that fill when the fill is shifted", () => {
  it("double-clicking the fill's outer outline selects its hole too, so dragging shifts both as one object", () => {
    let st = click(cutHeadHole(), at(100, 150, { target: 0 })); // pick the blue fill
    st = doubleClick(st, at(80, 150));                          // double-click the blue fill's left edge
    // Shift the blue fill 60 units left (so its right edge x=180 now bisects the old head at x=160!):
    st = drag(st, at(80, 150), at(20, 150));
    const m = st.session.model;
    // 1. The hole moved 60 units left WITH the fill (160 → 100):
    expect(paintedBy(m, 0, { x: 100, y: 150 })).toBe(false);
    expect(regionAt(m, { x: 100, y: 150 })).toBeNull();
    // 2. No stationary mask left at (160, 150): inside the shifted fill at (150, 150) it paints blue,
    //    and outside the shifted fill at (185, 150) — where the right half of the head is — NOTHING paints!
    expect(paintedBy(m, 0, { x: 150, y: 150 })).toBe(true);
    expect(paintedBy(m, 0, { x: 185, y: 150 })).toBe(false);
    expect(paintedBy(m, 0, { x: 170, y: 150 })).toBe(true);
    // 3. The black stroked head circle (`owner = 2`) did NOT move:
    const written = writeObjects(ICON, st.session, MATS)!;
    expect(written).toContain('stroke-width="4" d="M160 135C168 135');
  });

  it("dragging directly on the painted fill interior shifts the fill AND its hole together as one undo step", () => {
    let st = cutHeadHole();
    st = drag(st, at(100, 80, { target: 0 }), at(40, 80, { target: 0 })); // shift 60 left by dragging the paint
    const m = st.session.model;
    expect(paintedBy(m, 0, { x: 100, y: 150 })).toBe(false); // the hole travelled to x = 100
    expect(paintedBy(m, 0, { x: 185, y: 150 })).toBe(false); // no half-circle painted outside the fill!
    expect(paintedBy(m, 0, { x: 50, y: 80 })).toBe(true);    // shifted fill paints on the left
    expect(st.session.undo).toHaveLength(2);                 // 1 for the cut, 1 for the shift
  });

  it("arrow-key nudges after double-clicking the fill carry the hole along", () => {
    let st = click(cutHeadHole(), at(100, 80, { target: 0 }));
    st = doubleClick(st, at(100, 80)); // double-clicking the painted interior selects the whole fill + hole
    for (let i = 0; i < 6; i++) st = keyDown(st, { key: "ArrowLeft", ctrl: false, shift: true }).state; // -60
    const m = st.session.model;
    expect(paintedBy(m, 0, { x: 100, y: 150 })).toBe(false); // hole at 160 - 60 = 100
    expect(paintedBy(m, 0, { x: 185, y: 150 })).toBe(false); // no stray paint outside the fill
  });

  it("carries MULTIPLE holes with the fill when shifted", () => {
    const twoHoles = `<svg viewBox="0 0 300 300">`
      + `<path fill="#28ACEE" d="M50 50L250 50L250 250L50 250Z"/>`
      + `<path fill="none" stroke="#000" d="M80 80L110 80L110 110L80 110Z"/>`
      + `<path fill="none" stroke="#000" d="M180 180L210 180L210 210L180 210Z"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(twoHoles, MATS), [0]));
    st = click(st, at(95, 95, { alt: true, shift: true }));
    st = click(st, at(195, 195, { alt: true, shift: true }));
    st = doubleClick(st, at(50, 150));
    st = drag(st, at(50, 150), at(10, 150)); // shift 40 left
    const m = st.session.model;
    expect(paintedBy(m, 0, { x: 55, y: 95 })).toBe(false);   // first hole moved 95 → 55
    expect(paintedBy(m, 0, { x: 155, y: 195 })).toBe(false); // second hole moved 195 → 155
    expect(paintedBy(m, 0, { x: 225, y: 195 })).toBe(false); // outside shifted fill stays unpainted
  });

  it("keeps an evenodd fill's hole intact when cut by a stroke-only cutter and shifted", () => {
    const evenodd = ICON.replace('fill="#28ACEE"', 'fill="#28ACEE" fill-rule="evenodd"');
    let st = cutHeadHole(evenodd);
    expect(regionAt(st.session.model, { x: 160, y: 150 })).toBeNull(); // hole recognised in session too
    st = click(st, at(100, 80, { target: 0 }));
    st = doubleClick(st, at(80, 150));
    st = drag(st, at(80, 150), at(20, 150));
    expect(paintedBy(st.session.model, 0, { x: 100, y: 150 })).toBe(false);
    expect(paintedBy(st.session.model, 0, { x: 185, y: 150 })).toBe(false);
  });

  it("does NOT glue together disjoint filled shapes that happen to live in the same <path>", () => {
    // Like outlined text (letter O at x=10..90 with hole 35..65, and a separate bar at x=200..240):
    const letters = `<svg viewBox="0 0 300 100">`
      + `<path fill="#000" d="M10 10L90 10L90 90L10 90ZM35 65L65 65L65 35L35 35ZM200 10L240 10L240 90L200 90Z"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(letters, [IDENTITY]), [0]));
    st = doubleClick(st, at(10, 50)); // double-click the 'O'
    st = drag(st, at(10, 50), at(30, 50)); // move 'O' +20 right
    const m = st.session.model;
    expect(paintedBy(m, 0, { x: 70, y: 50 })).toBe(false);  // O's hole moved 50 → 70
    expect(paintedBy(m, 0, { x: 35, y: 50 })).toBe(true);   // O's left stroke moved 10..35 → 30..55
    expect(m.subs[2].anchors[0]).toMatchObject({ x: 200, y: 10 }); // the separate bar stayed put!
  });

  it("still lets Alt+Double-click exclude just the hole ring when asked", () => {
    let st = click(cutHeadHole(), at(100, 80, { target: 0 }));
    st = doubleClick(st, at(80, 150));              // selects outer + hole
    const total = st.session.selection.length;
    st = doubleClick(st, at(175, 150, { alt: true })); // exclude the hole ring on its right point (175, 150)
    expect(st.session.selection.length).toBeLessThan(total);
    expect(st.session.selection.length).toBe(4);    // only the 4 outer square corners remain
  });

  it("ref image-8: dragging the blue fill inside a nested fill='none' magnifier carries the head hole without mask inversion", () => {
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 320">`
      + `<path data-edit-path="0" fill="#1da1f2" fill-rule="evenodd" d="M40 20L220 20L200 290L40 290Z"/>`
      + `<path data-edit-path="1" fill="none" stroke="#000" stroke-width="4" d="`
      + `M170 70A80 80 0 1 1 169.99 70Z `
      + `M170 110A22 22 0 1 1 169.99 110Z `
      + `M130 190C135 160 205 160 210 190"/>`
      + `</svg>`;
    let st = editorState(newSession(loadObjects(doc, [IDENTITY, IDENTITY]), []));
    st = click(st, at(170, 132, { alt: true, shift: true })); // punch the person's head hole (centre 170, 132)
    expect(paintedBy(st.session.model, 0, { x: 170, y: 132 })).toBe(false);
    // Drag on painted blue fill at (120, 150) — inside the outer magnifier ring, >14 px from every stroke
    st = drag(st, at(120, 150, { target: 0 }), at(60, 150, { target: 0 })); // shift blue card 60 left
    const m = st.session.model;
    expect(paintedBy(m, 0, { x: 110, y: 132 })).toBe(false);  // head hole moved 170 → 110 with the card
    expect(paintedBy(m, 0, { x: 180, y: 132 })).toBe(false);  // NO half-blue inverted mask sticking out past the right edge (~150)!
    expect(paintedBy(m, 0, { x: 75, y: 132 })).toBe(true);    // card fill around the moved hole stays solid blue
  });
});
