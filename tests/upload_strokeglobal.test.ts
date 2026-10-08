// upload_strokeglobal.test.ts — ONE stroke definition (2026-10-08, the
// reviewer's `stroke="#111"` root vs `stroke="#000" stroke-width=".8"` group
// vs a width on every shape): a stroke property the visibly stroked shapes
// agree on lives once on the root and nowhere else; shapes that do not stroke
// say `none` only when the root now paints a stroke; when the shapes
// disagree the property lives on each stroked shape and on nothing else.

import { describe, expect, it } from "vitest";
import { baseStroke, inheritStroke } from "../src/lib/upload/geom/stroke";
import { unifyStrokes } from "../src/lib/upload/strokeglobal";

function parse(markup: string, rootAttrs = ""): Element {
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${rootAttrs}>${markup}</svg>`, "image/svg+xml").documentElement;
}

/** Every element carrying the attribute, as `tag=value` — the whole picture in one line. */
function where(root: Element, attr: string): string[] {
  return Array.from(root.querySelectorAll("*")).concat(root)
    .filter((el) => el.hasAttribute(attr))
    .map((el) => `${el.nodeName}=${el.getAttribute(attr)}`)
    .sort();
}

describe("inheritStroke — the paint in effect is kept, not only whether it is none", () => {
  it("resolves the paint down the tree: own, inherited, none, currentColor", () => {
    const root = parse(`<g stroke="#000"><path d="M0 0h1"/><path d="M0 0h1" stroke="none"/><path d="M0 0h1" stroke="currentColor"/></g>`, `stroke="#111"`);
    const svg = inheritStroke(root, baseStroke());
    expect(svg.paint).toBe("#111");
    const g = inheritStroke(root.firstElementChild as Element, svg);
    expect(g.paint).toBe("#000");
    const [own, none, current] = Array.from(root.querySelectorAll("path")).map((p) => inheritStroke(p, g));
    expect(own).toMatchObject({ paint: "#000", none: false });
    expect(none).toMatchObject({ paint: "none", none: true });
    expect(current).toMatchObject({ paint: "currentColor", none: false });
    expect(baseStroke().paint).toBe("none");
  });
});

describe("unifyStrokes — the shapes agree: once on the root, nowhere else", () => {
  it("the reviewer's document: root #111, group #000/.8, widths on every shape → one stroke, one width, both on <svg>", () => {
    const root = parse(`<g stroke="#000" stroke-width=".8" fill="none"><path d="M4 4h16" stroke-width="2"/><path d="M4 12h16" stroke-width="2"/></g>`
      + `<rect x="2" y="2" width="3" height="3" fill="#f00" stroke="#000" stroke-width="2"/>`, `stroke="#111"`);
    expect(unifyStrokes(root)).toEqual({ stroke: "#000", strokeWidth: "2" });
    expect(where(root, "stroke")).toEqual(["svg=#000"]);
    expect(where(root, "stroke-width")).toEqual(["svg=2"]);
  });

  it("a shape that does not stroke says `none` — the root would otherwise paint it", () => {
    const root = parse(`<path d="M4 4h16" stroke="#000" stroke-width="1.5"/><rect x="2" y="2" width="3" height="3" fill="#f00"/>`
      + `<g stroke="none"><circle cx="1" cy="1" r="1" fill="#0f0"/></g>`);
    expect(unifyStrokes(root)).toEqual({ stroke: "#000", strokeWidth: "1.5" });
    expect(where(root, "stroke")).toEqual(["circle=none", "rect=none", "svg=#000"]);
    expect(where(root, "stroke-width")).toEqual(["svg=1.5"]);
  });

  it("the artwork's own single width and paint are hoisted the same way (width 0, artwork colour)", () => {
    const root = parse(`<g stroke="currentColor" stroke-width="0.75"><path d="M4 4h16"/><path d="M4 12h16" stroke-width="0.75"/></g>`);
    expect(unifyStrokes(root)).toEqual({ stroke: "currentColor", strokeWidth: "0.75" });
    expect(where(root, "stroke")).toEqual(["svg=currentColor"]);
    expect(where(root, "stroke-width")).toEqual(["svg=0.75"]);
  });

  it("an inline-style stroke counts as a definition too, and goes", () => {
    const root = parse(`<path d="M4 4h16" style="stroke:#000;stroke-width:2;fill:none"/><path d="M4 12h16" stroke="#000" stroke-width="2"/>`);
    expect(unifyStrokes(root)).toEqual({ stroke: "#000", strokeWidth: "2" });
    expect(where(root, "stroke")).toEqual(["svg=#000"]);
    expect(root.querySelector("path")?.getAttribute("style")).toBe("fill:none");
  });
});

describe("unifyStrokes — the shapes disagree: on each stroked shape, on nothing else", () => {
  it("mixed colours stay per shape, explicitly; the root and the group carry none", () => {
    const root = parse(`<g stroke="#000" stroke-width="2"><path d="M4 4h16"/><path d="M4 12h16" stroke="#f00"/></g>`, `stroke="#111"`);
    expect(unifyStrokes(root)).toEqual({ stroke: null, strokeWidth: "2" });
    expect(where(root, "stroke")).toEqual(["path=#000", "path=#f00"]);
    expect(where(root, "stroke-width")).toEqual(["svg=2"]);
  });

  it("mixed widths stay per shape; a shape that does not stroke carries no width at all", () => {
    const root = parse(`<g stroke="#000" stroke-width="2"><path d="M4 4h16"/><path d="M4 12h16" stroke-width="3"/><rect x="0" y="0" width="1" height="1" stroke="none" stroke-width="9"/></g>`);
    expect(unifyStrokes(root)).toEqual({ stroke: "#000", strokeWidth: null });
    expect(where(root, "stroke-width")).toEqual(["path=2", "path=3"]);
    expect(where(root, "stroke")).toEqual(["rect=none", "svg=#000"]);
  });
});

describe("unifyStrokes — nothing strokes: nothing is defined", () => {
  it("a filled-only icon ends with no stroke and no stroke-width anywhere, whatever the source said", () => {
    const root = parse(`<g stroke="none" stroke-width=".8"><rect x="0" y="0" width="1" height="1" fill="#000"/></g>`, `stroke-width="3"`);
    expect(unifyStrokes(root)).toEqual({ stroke: null, strokeWidth: null });
    expect(where(root, "stroke")).toEqual([]);
    expect(where(root, "stroke-width")).toEqual([]);
  });

  it("leaves <metadata>, <title> and <desc> alone", () => {
    const root = parse(`<title>t</title><path d="M4 4h16" stroke="#000" stroke-width="2"/>`);
    unifyStrokes(root);
    expect(root.querySelector("title")?.textContent).toBe("t");
    expect(where(root, "stroke")).toEqual(["svg=#000"]);
  });
});
