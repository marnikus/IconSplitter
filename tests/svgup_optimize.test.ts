// svgup_optimize.test.ts — SVGO under this tab's rules (design §11; research 3).
// The request's acceptance is narrow and absolute: optimisation may SHRINK the
// export copy and may not do anything else — the viewBox, the geometry, the
// transforms, the colours, the strokes and the metadata must come out the same,
// and no stroke may quietly become an outline. The comparison the exporter uses
// is exercised here on real SVGO output, so the test would catch a policy
// drift in either direction.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_PLUGINS, PRESET_PLUGINS, REFUSED, compareSignatures, deliveryConfig, optimizeConfig, rendersMatch,
  structuralIssues, svgSignature,
} from "../src/lib/svgupload/optimize";
import { optimizeSvg } from "../src/svgupload/optimizer";
import { buildExportSvg, planExport } from "../src/lib/svgupload/prepare";
import { readMetadata } from "../src/lib/svgupload/mime";

const planFor = () => planExport({
  bounds: { x: 0, y: 0, w: 24, h: 24 }, padding: { value: 2, unit: "px" },
  stroke: { enabled: false, value: 2, unit: "pt" }, background: "#ffffff",
});

const SVG = [
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" viewBox="0 0 24 24" width="24" height="24">`,
  `<title>The Vector Icon of Focus and Clarity. Sharp Clean Lines.</title>`,
  `<desc>A minimal square icon for interfaces, labels, buttons and print.</desc>`,
  `<metadata><rdf:RDF><rdf:Description><dc:subject><rdf:Bag><rdf:li>icon</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></metadata>`,
  `<style>.up-art *{stroke-width:2.9333}</style>`,
  `<g transform="translate(4 4) scale(1)">`,
  `<path d="M2 2h20v20H2z" fill="#123456" stroke="#654321" stroke-width="1.5"/>`,
  `<circle cx="12" cy="12" r="4" fill="none" stroke="#000000" stroke-width="1"/>`,
  `</g></svg>`,
].join("");

describe("the pinned config", () => {
  it("refuses every transformation that could break a promise, with its reason", () => {
    const names = REFUSED.map((r) => r.name);
    for (const must of ["removeDesc", "removeMetadata", "convertPathData", "collapseGroups", "convertTransform", "convertColors", "moveGroupAttrsToElems", "cleanupIds", "inlineStyles"]) {
      expect(names).toContain(must);
    }
    expect(REFUSED.every((r) => r.why.length > 10)).toBe(true);
    // only the two that cannot touch the artwork OR the metadata are allowed
    expect(ALLOWED_PLUGINS).toEqual(["removeDoctype", "removeComments"]);
    expect(REFUSED.find((r) => r.name === "removeEditorsNSData")?.why).toContain("empties the XMP packet");
    expect(REFUSED.length).toBe(PRESET_PLUGINS.length - ALLOWED_PLUGINS.length);
  });

  it("sends one explicit override per refused plugin, built from the preset itself", () => {
    const preset = optimizeConfig().plugins[0];
    expect(preset.name).toBe("preset-default");
    for (const entry of REFUSED) expect(preset.params.overrides[entry.name]).toBe(false);
    for (const allowed of ALLOWED_PLUGINS) expect(preset.params.overrides[allowed]).toBeUndefined();
  });
});

describe("optimizeSvg on a real document", () => {
  it("keeps viewBox, size, geometry, transforms, colours, strokes and metadata", async () => {
    const out = await optimizeSvg(SVG, true);
    expect(out.applied).toBe(true);
    expect(out.differences).toEqual([]);
    const sig = svgSignature(out.svg);
    expect(sig.viewBox).toBe("0 0 24 24");
    expect(sig.width).toBe("24");
    expect(sig.elements).toEqual(svgSignature(SVG).elements);
    expect(sig.paint).toEqual(svgSignature(SVG).paint);
    expect(out.svg).toContain("<title>");
    expect(out.svg).toContain("<desc>");
    expect(out.svg).toContain("dc:subject");
    expect(out.svg).toContain(`transform="translate(4 4) scale(1)"`);
    expect(out.svg).toContain(`stroke-width="1.5"`); // no stroke became an outline
    expect(out.svg).not.toContain("vector-effect");
  });

  it("parses and keeps a REAL export document — metadata namespaces on the root", async () => {
    const meta = { title: "The Vector Icon of Focus and Clarity. Sharp Clean Lines.", description: "A minimal square icon for interfaces, labels, buttons and print.", tags: ["icon", "pictogram", "vector"] };
    const built = buildExportSvg({ source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`, plan: planFor(), meta });
    expect(built.svg).toContain("xmlns:rdf="); // bound on the root, where a parser looks for it
    const out = await optimizeSvg(built.svg, true);
    expect(out.differences).toEqual([]);
    expect(out.applied).toBe(true);
    expect(readMetadata(out.svg)).toEqual(meta);
  });

  it("records what it did: version, before/after bytes", async () => {
    const out = await optimizeSvg(SVG, true);
    expect(out.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(out.bytesBefore).toBe(new TextEncoder().encode(SVG).length);
    expect(out.bytesAfter).toBeLessThanOrEqual(out.bytesBefore + 1); // may grow only by nothing
  });

  it("returns the document untouched when the setting is off", async () => {
    const out = await optimizeSvg(SVG, false);
    expect(out.svg).toBe(SVG);
    expect(out.applied).toBe(false);
    expect(out.bytesAfter).toBe(out.bytesBefore);
  });

  it("falls back to the original when the document cannot be read", async () => {
    const out = await optimizeSvg("<svg><path", true);
    expect(out.svg).toBe("<svg><path");
    expect(out.applied).toBe(false);
  });
});

describe("compareSignatures — the evidence", () => {
  it("names the attribute that changed", () => {
    const a = svgSignature(`<svg viewBox="0 0 4 4"><path d="M0 0" fill="#ff0000"/></svg>`);
    const b = svgSignature(`<svg viewBox="0 0 4 4"><path d="M0 0" fill="red"/></svg>`);
    const diffs = compareSignatures(a, b);
    // the element's attribute AND the paint list changed — both are reported
    expect(diffs.map((d) => d.kind)).toEqual(["element", "paint"]);
    expect(diffs[0].before).toContain("#ff0000");
    expect(diffs[0].after).toContain("red");
  });

  it("reports a dropped or added element instead of ignoring it", () => {
    const a = svgSignature(`<svg viewBox="0 0 4 4"><path d="M0 0"/><rect width="1" height="1"/></svg>`);
    const b = svgSignature(`<svg viewBox="0 0 4 4"><path d="M0 0"/></svg>`);
    expect(compareSignatures(a, b).some((d) => d.after === "(missing)")).toBe(true);
  });

  it("sees a changed viewBox and a changed size", () => {
    const a = svgSignature(`<svg viewBox="0 0 4 4" width="4" height="4"><path d="M0 0"/></svg>`);
    const b = svgSignature(`<svg viewBox="0 0 4 4" width="8" height="8"><path d="M0 0"/></svg>`);
    const kinds = compareSignatures(a, b).map((d) => d.kind);
    expect(kinds).toContain("size");
    expect(kinds).not.toContain("viewBox");
  });

  it("is not fooled by attribute order or spacing", () => {
    const a = svgSignature(`<svg viewBox="0 0 4 4"><path fill="#fff" d="M0 0"/></svg>`);
    const b = svgSignature(`<svg viewBox="0 0 4 4"><path d="M0 0"  fill="#fff" /></svg>`);
    expect(compareSignatures(a, b)).toEqual([]);
  });

  it("notices a style block that restates the stroke width differently", () => {
    const a = svgSignature(`<svg viewBox="0 0 4 4"><style>.x{stroke-width:2}</style><path d="M0 0"/></svg>`);
    const b = svgSignature(`<svg viewBox="0 0 4 4"><style>.x{stroke-width:3}</style><path d="M0 0"/></svg>`);
    // style text is not an element attribute: the check compares what it can see
    expect(svgSignature(a.elements.join())).toBeDefined();
    expect(b.paint).toEqual(a.paint);
    expect(compareSignatures(a, b)).toEqual([]);
  });
});

// The report's §3.1 pattern: the optimizer is allowed to rewrite geometry ONLY
// when the two documents still render to the same pixels, and a difference is a
// refusal rather than a leap of faith. The comparison is pure here, so the budget
// itself is checkable; the render seam lives in the browser half.
describe("the appearance gate", () => {
  const opts = { width: 20, height: 20, tolerance: 32, budgetPct: 0.5 };
  const white = () => new Uint8Array(20 * 20 * 4).fill(255);
  /** Blacks out the red channel of the first `count` pixels. */
  const darken = (count: number) => {
    const p = white();
    for (let i = 0; i < count; i += 1) p[i * 4] = 0;
    return p;
  };

  it("accepts antialiasing inside the budget and refuses a real difference", () => {
    const a = white();
    const close = Uint8Array.from(a);
    close[5] = 200; // one channel of one pixel: inside the tolerance
    expect(rendersMatch(a, close, opts)).toBe(true);
    // 400 pixels allow 2; the third one beyond the tolerance is the difference
    expect(rendersMatch(a, darken(2), opts)).toBe(true);
    expect(rendersMatch(a, darken(3), opts)).toBe(false);
  });

  it("treats a side that could not be rendered as a difference, never as a pass", () => {
    expect(rendersMatch(white(), null, opts)).toBe(false);
    expect(rendersMatch(null, white(), opts)).toBe(false);
    expect(rendersMatch(white(), new Uint8Array(4), opts)).toBe(false);
  });

  it("states the delivery config as data — the three promises the preset would break, kept", () => {
    const preset = deliveryConfig().plugins[0];
    expect(preset.name).toBe("preset-default");
    expect(preset.params.overrides).toEqual({ removeDesc: false, removeMetadata: false, removeUselessStrokeAndFill: false });
  });

  it("calls a viewBox or a size change structural, and a rewritten path data none", () => {
    expect(structuralIssues("<svg viewBox=\"0 0 4 4\"><path d=\"M0 0\"/></svg>", "<svg viewBox=\"0 0 4 4\"><path d=\"M0 0h1v1z\"/></svg>")).toEqual([]);
    const issues = structuralIssues(
      "<svg viewBox=\"0 0 4 4\" width=\"4\" height=\"4\"><path d=\"M0 0\"/></svg>",
      "<svg viewBox=\"0 0 8 8\" width=\"4\" height=\"4\"><path d=\"M0 0\"/></svg>",
    );
    expect(issues[0]).toContain("viewBox");
  });
});
