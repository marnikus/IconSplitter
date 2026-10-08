// RULE 8 — the REBUILDING pass of the clean policy runs for real (2026-10-08):
// one test per fold it performs. The check suite (`upload_clean.test.ts`) proves
// what a shipped file may NOT contain; this one proves the pass that makes a
// dirty file legal does every single fold the policy promises — stylesheets,
// naming attributes, foreign vocabulary, unreferenced and duplicated ids — and
// still refuses, loudly, what it cannot fold without changing the picture.
import { describe, expect, it } from "vitest";
import { enforceExportSvg, unsupportedContent, verifyExportSvg } from "../src/lib/upload/clean";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const XLINK = `xmlns:xlink="http://www.w3.org/1999/xlink"`;
const SVG = (body: string, attrs = ""): string =>
  `<svg ${NS} version="1.1" viewBox="0 0 24 24" ${attrs}>${body}</svg>`;

const parseRoot = (source: string): Element =>
  new DOMParser().parseFromString(source, "image/svg+xml").documentElement;

/** Rebuilds and throws on a still-dirty result, so each test reads its own output. */
function rebuilt(source: string): string {
  const report = enforceExportSvg(source);
  if (report.violations.length > 0) throw new Error(`not clean: ${report.violations.join("; ")}`);
  return report.svg;
}

describe("enforceExportSvg — the folds that make a dirty file legal", () => {
  it("refuses text that is not a document at all, and leaves it untouched", () => {
    const report = enforceExportSvg("<svg><path");
    expect(report.rebuilt).toBe(false);
    expect(report.violations).toEqual(["the document does not parse as XML"]);
    expect(report.svg).toBe("<svg><path");
    expect(verifyExportSvg("<html></html>")).toEqual(["the document does not parse as XML"]);
  });

  it("names an unusable viewBox instead of guessing one", () => {
    expect(verifyExportSvg(`<svg ${NS} version="1.1" viewBox="0 0 1"><path d="M0 0h1v1z"/></svg>`))
      .toContain("the root must carry a valid viewBox of four numbers");
  });

  it("strips a foreign editor vocabulary — element, attribute and its namespace", () => {
    const source = `<svg ${NS} version="1.1" viewBox="0 0 24 24" ` +
      `xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" ` +
      `xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">` +
      `<g i:extraneous="self" data-name="Layer 1" aria-label="shape" xml:space="preserve">` +
      `<sketch:type/><path d="M4 4h16v16H4z"/></g></svg>`;
    const violations = verifyExportSvg(source);
    expect(violations).toContainEqual(expect.stringContaining("i:extraneous"));
    expect(violations).toContainEqual(expect.stringContaining("sketch:type"));
    expect(violations).toContainEqual(expect.stringContaining("data-name"));
    const out = rebuilt(source);
    for (const gone of ["i:extraneous", "xmlns:i", "sketch:", "data-name", "aria-label", "xml:space"]) {
      expect(out).not.toContain(gone);
    }
    expect(out).toContain("<path");
  });

  it("drops an unused xlink declaration and keeps a used one", () => {
    const unused = SVG(`<path d="M4 4h16v16H4z"/>`, XLINK);
    expect(verifyExportSvg(unused)).toContainEqual(expect.stringContaining("xmlns:xlink (http://www.w3.org/1999/xlink) is unused"));
    expect(rebuilt(unused)).not.toContain("xmlns:xlink");

    const used = SVG(
      `<defs><path id="shape" d="M4 4h16v16H4z"/></defs><use xlink:href="#shape"/>`,
      XLINK,
    );
    const out = rebuilt(used);
    expect(out).toContain("xmlns:xlink");
    expect(out).toContain(`xlink:href="#a"`);
    expect(out).not.toContain(`id="shape"`);
  });

  it("refuses a px size on the root and removes it — the viewBox is the size (stock review item 4)", () => {
    const sized = SVG(`<path d="M4 4h16v16H4z"/>`, `width="1400" height="800"`);
    expect(verifyExportSvg(sized)).toContain("the root must not fix a pixel size (width/height) — the viewBox is the size");
    const out = rebuilt(sized);
    expect(out).not.toMatch(/<svg[^>]*\swidth=/);
    expect(out).not.toMatch(/<svg[^>]*\sheight=/);
    expect(out).toContain(`viewBox="0 0 24 24"`);
    // a shape's own width/height are geometry, never touched
    expect(rebuilt(SVG(`<rect x="1" y="1" width="4" height="4"/>`))).toContain(`width="4"`);
  });

  it("declares a namespace only on the root: inline repeats are hoisted to ONE declaration (stock review item 1)", () => {
    const DC = `xmlns:dc="http://purl.org/dc/elements/1.1/"`;
    const RDF = `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"`;
    // Exactly what the old embed serialized: the prefix re-declared on every dc:* element.
    const repeated = SVG(
      `<metadata><rdf:RDF ${RDF}><rdf:Description><dc:title ${DC}>T</dc:title>` +
      `<dc:description ${DC}>D</dc:description></rdf:Description></rdf:RDF></metadata><path d="M4 4h16v16H4z"/>`,
    );
    expect(verifyExportSvg(repeated))
      .toContainEqual(expect.stringContaining("the namespace declaration xmlns:dc must be on the root"));
    const out = rebuilt(repeated);
    expect(out.match(/xmlns:dc=/g)).toHaveLength(1);
    expect(out.match(/xmlns:rdf=/g)).toHaveLength(1);
    expect(out.slice(0, out.indexOf(">"))).toContain(DC);
    expect(out).toContain("<dc:title>T</dc:title>");
    expect(enforceExportSvg(out).rebuilt).toBe(false); // idempotent: the hoisted file is clean
    // Declared once on the root and used: no violation at all.
    const once = SVG(`<metadata><rdf:RDF><rdf:Description><dc:title>T</dc:title></rdf:Description></rdf:RDF></metadata>`, `${RDF} ${DC}`);
    expect(verifyExportSvg(once)).toEqual([]);
    // Declared on the root but used nowhere: unused, and the rebuild drops it.
    const unused = SVG(`<path d="M4 4h16v16H4z"/>`, DC);
    expect(verifyExportSvg(unused)).toContainEqual(expect.stringContaining("xmlns:dc (http://purl.org/dc/elements/1.1/) is unused"));
    expect(rebuilt(unused)).not.toContain("xmlns:dc");
  });

  it("keeps a referenced id under a minimal name, and reports a plain `href` reference", () => {
    const source = SVG(`<defs><path id="Shape" d="M4 4h16v16H4z"/></defs><use href="#Shape"/>`);
    expect(verifyExportSvg(source))
      .toContainEqual(expect.stringContaining(`the id "Shape" must be a minimal generated name`));
    const out = rebuilt(source);
    expect(out).toContain(`id="a"`);
    expect(out).toContain(`href="#a"`);
  });

  it("removes an id nothing references, and the duplicate of one that is referenced", () => {
    const source = SVG(
      `<defs><linearGradient id="G"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<linearGradient id="G"><stop offset="1" stop-color="#fff"/></linearGradient></defs>` +
      `<path id="unused" fill="url(#G)" d="M4 4h16v16H4z"/>`,
    );
    expect(verifyExportSvg(source)).toContainEqual(expect.stringContaining(`the id "unused"`));
    const out = rebuilt(source);
    expect(out).not.toContain(`id="unused"`);
    expect(out).toContain(`fill="url(#a)"`);
    expect(out.match(/id="a"/g)).toHaveLength(1);
  });

  it("renames past z: 27 referenced ids become a…z then aa", () => {
    const stops = Array.from({ length: 27 }, (_, i) =>
      `<linearGradient id="g${i}"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<path fill="url(#g${i})" d="M0 ${i}h1v1z"/>`).join("");
    const out = rebuilt(SVG(`<defs>${stops}</defs>`));
    expect(out).toContain(`id="z"`);
    expect(out).toContain(`id="aa"`);
    expect(out).toContain(`fill="url(#aa)"`);
    expect(out).not.toMatch(/id="g\d+"/);
  });
});

describe("enforceExportSvg — the paint-only stylesheet subset", () => {
  it("folds a class rule into the elements, so the class names can go", () => {
    const source = SVG(`<style>.a{fill:#123456}</style><path class="a" fill="none" d="M4 4h16v16H4z"/>`);
    const out = rebuilt(source);
    expect(out).not.toContain("<style");
    expect(out).not.toContain("class=");
    expect(out).toContain(`fill="#123456"`);
  });

  it("folds a tag rule too, and an empty block just disappears", () => {
    const out = rebuilt(SVG(`<style>path { fill : #abcdef ; }</style><path d="M4 4h16v16H4z"/>`));
    expect(out).toContain(`fill="#abcdef"`);
    expect(rebuilt(SVG(`<style>  </style><path d="M4 4h16v16H4z"/>`))).not.toContain("<style");
  });

  it("folds the inline paint properties and keeps the ones it cannot fold", () => {
    // `style="fill:#000"` is not itself a violation (a paint is not a name), so
    // a document whose ONLY flaw is the style attribute is left byte-identical…
    const onlyStyle = SVG(`<path style="fill:#000;font-family:Arial" d="M4 4h16v16H4z"/>`);
    const untouched = enforceExportSvg(onlyStyle);
    expect(untouched.rebuilt).toBe(false);
    expect(untouched.svg).toBe(onlyStyle);
    // …but as soon as anything else forces a rebuild, the paint property folds
    // into the attribute it means, and only the unfoldable rest stays inline.
    const out = rebuilt(SVG(`<path id="dead" style="fill:#000;font-family:Arial" d="M4 4h16v16H4z"/>`));
    expect(out).toContain(`fill="#000"`);
    expect(out).toContain(`style="font-family:Arial"`);
    expect(out).not.toContain("fill:#000");
  });

  it("refuses every stylesheet it cannot fold — naming the reason, and changing nothing", () => {
    const refusals = [
      `<style>.a{fill}</style>`, // a declaration without a value
      `<style>.a.b{fill:#000}</style>`, // a selector outside the subset
      `<style>#id{fill:#000}</style>`,
      `<style>.a{fill:url(http://example.com/sprite.svg)}</style>`, // an external reference
      `<style>.a{fill:var(--ink)}</style>`,
      `<style>path{fill:#000} oops</style>`, // trailing garbage
      `<style>@import url(x.css);</style>`,
      `<style>.a{transform:translate(1px)}</style>`, // could MOVE the artwork: never guessed at
    ];
    for (const block of refusals) {
      const source = SVG(`${block}<path class="a" d="M4 4h16v16H4z"/>`);
      // the refusal prepare reports, with the block named as the reason
      expect(unsupportedContent(parseRoot(source))).toContain("paint-only rule list");
      // and the honest rebuild outcome: the block it cannot fold is left in
      // place, so the violation survives and the file ships unchanged.
      const report = enforceExportSvg(source);
      expect(report.svg).toBe(source);
      expect(report.violations).toContainEqual(expect.stringContaining("<style>"));
    }
  });
});
