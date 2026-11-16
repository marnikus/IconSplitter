// pathedit_shapes.test.ts — every drawn shape is an editable object, and a
// thin line is still easy to pick (2026-11-06). The reported icon: one big
// path, a square path and five <circle>s, stroke-width 1 in a 1024 viewBox
// (half a pixel on screen, fill none) — the square and the circles could not
// be selected. Shapes load as anchors; a changed shape is written back as a
// <path> with its other attributes; a click within the hit band of ANY path,
// or inside an unselected closed shape, selects it.
import { describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { IDENTITY } from "../src/lib/pathedit/model";
import { loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { newSession } from "../src/lib/pathedit/session";
import { annotatePaths, pathTags, withPathD } from "../src/lib/pathedit/svgdoc";

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" stroke="#000" stroke-width="1"><title>t</title>'
  + '<path d="M208 543L243 576M355 461L512 333L664 463Z"/><path d="M532 488H598V554H532Z"/>'
  + '<circle cx="243" cy="539" r="36"/><circle cx="243" cy="730" r="36"/><circle cx="512" cy="801" r="36"/>'
  + '<circle cx="742" cy="737" r="36"/><circle cx="777" cy="539" r="36"/></svg>';
const MATS = Array.from({ length: 7 }, () => IDENTITY);
/** About 600 px for 1024 units: one screen pixel is ~1.7 units. */
const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 1.7, target: null, ...mods });
const start = (objects: number[] = []): EditorState => editorState(newSession(loadObjects(ICON, MATS), objects));
const click = (st: EditorState, i: PointerInput) => pointerUp(pointerDown(st, i));

describe("every drawn shape is an object", () => {
  it("finds paths and circles in order, with path data for each", () => {
    const tags = pathTags(ICON);
    expect(tags.map((t) => t.kind)).toEqual(["path", "path", "circle", "circle", "circle", "circle", "circle"]);
    expect(tags[2].d).toMatch(/^M279 539C/);
  });

  it("reads rect, ellipse, line, polyline and polygon; skips what is never drawn (defs, clipPath)", () => {
    const svg = '<svg><defs><circle cx="1" cy="1" r="1"/></defs><clipPath id="c"><rect width="9" height="9"/></clipPath>'
      + '<rect x="1" y="2" width="3" height="4"/><ellipse cx="5" cy="5" rx="2" ry="1"/><line x1="0" y1="0" x2="5" y2="5"/>'
      + '<polyline points="0,0 1,1 2,0"/><polygon points="0 0 4 0 4 4"/></svg>';
    const tags = pathTags(svg);
    expect(tags.map((t) => t.kind)).toEqual(["rect", "ellipse", "line", "polyline", "polygon"]);
    expect(tags.map((t) => t.d)).toEqual(expect.arrayContaining(["M1 2L4 2L4 6L1 6Z", "M0 0L5 5", "M0 0L1 1L2 0", "M0 0L4 0L4 4Z"]));
  });

  it("a changed circle is written back as a <path>, keeping its other attributes", () => {
    const svg = '<svg><circle class="c" cx="10" cy="10" r="5" stroke="red"/></svg>';
    expect(withPathD(svg, 0, "M1 1L2 2")).toBe('<svg><path d="M1 1L2 2" class="c" stroke="red"/></svg>');
    expect(annotatePaths(svg)).toContain('<circle data-edit-path="0" class="c"');
  });
});

describe("thin lines are easy to pick", () => {
  it("a click a few pixels from the square's half-pixel edge selects the square", () => {
    const st = click(start([0]), at(565, 491)); // 3 units off the top edge, nothing under the pointer in the DOM
    expect(st.session.objects).toEqual([1]);
  });

  it("a click inside an unselected circle selects that circle; Shift adds another", () => {
    let st = click(start([0]), at(512, 801));
    expect(st.session.objects).toEqual([4]);
    st = click(st, at(777, 539, { shift: true }));
    expect(st.session.objects).toEqual([4, 6]);
  });

  it("an edited circle is written as a path; the other shapes stay byte for byte", () => {
    let st = click(start(), at(243, 730)); // circle 3
    st = pointerUp(pointerMove(pointerDown(st, at(279, 730)), at(300, 730)));
    const out = writeObjects(ICON, st.session, MATS)!;
    expect(out).not.toContain('<circle cx="243" cy="730" r="36"/>');
    expect(out).toMatch(/<path d="M300 730C/);
    expect(out).toContain('<circle cx="243" cy="539" r="36"/>');
    expect(out).toContain('<path d="M532 488H598V554H532Z"/>');
  });
});
