// @vitest-environment happy-dom
// svg_human_export.test.ts — the delivered SVG has to read like a document
// somebody drew, not like the tree a composer emitted (2026-11-19). After the
// clean pass the file still carried the composer's skeleton: chains of `<g>`
// that hold nothing but other elements, and attributes that only restate SVG's
// defaults (`rx="0"`, `stroke-linecap="butt"`, `stroke-miterlimit="4"`). Both
// are noise a person's export never has, and neither touches the picture.
import { afterEach, describe, expect, it } from "vitest";
import { cleanExportSvg } from "../src/lib/upload/svgclean";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

afterEach(() => setTextOutliner(null));

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (body: string, attrs = "") => `<svg ${NS} viewBox="0 0 10 10" ${attrs}>${body}</svg>`;

function cleaned(source: string): string {
  const out = cleanExportSvg(source);
  if (!out.ok) throw new Error(out.reason);
  return out.svg;
}

function DOMOf(source: string): Element {
  return new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
}

function attrOf(root: Element, tag: string, name: string): string | null {
  return root.querySelector(tag)?.getAttribute(name) ?? null;
}

describe("a delivered SVG keeps no skeleton", () => {
  it("unwraps chains of groups that hold nothing of their own", () => {
    const out = cleaned(svg('<g><g><g><rect width="4" height="4" fill="#000"/></g></g></g>'));
    expect(out).toBe(`<svg ${NS} viewBox="0 0 10 10" version="1.1"><rect width="4" height="4" fill="#000"/></svg>`);
  });

  it("keeps a group that carries paint, and bakes one that only carries a transform", () => {
    // RULE 26: a `translate`/`scale` wrapper is not structure a person drew — its
    // numbers are written into the geometry. A group that carries PAINT stays,
    // because its children inherit it.
    const out = cleaned(svg('<g transform="translate(1 2)"><rect width="4" height="4" fill="#000"/></g><g fill="#f00"><path d="M0 0h1"/></g>'));
    expect(out).not.toContain("translate(");
    expect(out).toContain('x="1"'); // the transform is in the numbers now
    expect(out).toContain('y="2"');
    expect(out).toContain('<g fill="#f00">');
  });

  it("unwraps only what became empty after the traces were stripped", () => {
    const out = cleaned(svg('<g data-export="icons"><g data-asset-id="a"><rect width="4" height="4" fill="#000"/></g></g>'));
    expect(out).not.toContain("<g");
  });

  it("drops attributes that only restate SVG's own defaults", () => {
    const out = cleaned(svg('<rect width="4" height="4" rx="0" ry="0" fill="#000" fill-opacity="1" fill-rule="nonzero"/>'
      + '<path d="M0 0h1" fill="none" stroke="#000" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4" stroke-opacity="1" opacity="1"/>'));
    expect(out).not.toMatch(/rx="0"|ry="0"|fill-opacity="1"|fill-rule="nonzero"|stroke-linecap="butt"|stroke-linejoin="miter"|stroke-miterlimit="4"|stroke-opacity="1"|opacity="1"/);
    expect(out).toContain('fill="#000"');
    expect(out).toContain('stroke="#000"');
  });

  it("keeps a value that is not the default", () => {
    const out = cleaned(svg('<rect width="4" height="4" rx="1" fill="#000"/><path d="M0 0h1" fill="none" stroke="#000" stroke-linecap="round" stroke-miterlimit="10"/>'));
    expect(out).toContain('rx="1"');
    expect(out).toContain('stroke-linecap="round"');
    expect(out).toContain('stroke-miterlimit="10"');
  });

  it("changes no geometry and no paint", () => {
    const source = svg('<g><rect width="4" height="4" rx="0" fill="#000"/><g transform="translate(1 1)"><circle cx="2" cy="2" r="1" fill="none" stroke="#123456" stroke-linecap="butt"/></g></g>');
    // The transform became numbers (RULE 26), so compare the picture, not the
    // skeleton: the rect keeps its box, the circle moved to where it draws.
    const drawn = DOMOf(cleaned(source));
    expect(attrOf(drawn, "rect", "width")).toBe("4");
    expect(attrOf(drawn, "rect", "fill")).toBe("#000");
    expect(attrOf(drawn, "circle", "cx")).toBe("3");
    expect(attrOf(drawn, "circle", "cy")).toBe("3");
    expect(attrOf(drawn, "circle", "stroke")).toBe("#123456");
    expect(drawn.querySelectorAll("rect").length + drawn.querySelectorAll("circle").length).toBe(2); // nothing dropped
    expect(verifyExportSvg(cleaned(source))).toEqual([]);
  });

  it("names the skeleton it removed, so export.json can say what the file lost", () => {
    const out = cleanExportSvg(svg('<g><rect width="4" height="4" rx="0" fill="#000"/></g>'));
    expect(out.ok && out.removed.join(" ")).toMatch(/empty group|default/);
  });
});

describe("the builder's shipped SVG reads like a document", () => {
  it("carries no pipeline fingerprints and no composer skeleton", async () => {
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(sheetSvg(), { cleanExport: true, expandText: true });
    const out = textOf(pkg, ".svg");
    expect(out).not.toBeNull();
    const document = out as string;
    expect(document).not.toMatch(/\bdata-[a-z-]+=/); // no bookkeeping
    expect(document).not.toContain("Generated with"); // no filler description
    expect(document).not.toMatch(/role="img"/);
    expect(document).not.toMatch(/<g(?: [^>]*)?>\s*<g(?: [^>]*)?>\s*<g/); // no chains of bare groups
    // A sheet keeps its px (the package sizes its rasters from them), so the icon
    // contract's "no fixed size" rule is checked on the icon copy, not here.
    expect(document).toMatch(/width="\d+"/);
  });
});
