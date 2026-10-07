// svgup_prepare.test.ts — the export copy of an approved SVG (design §5, C4–C6).
// The cases are the acceptance list: padding and output scale land in the
// artboard, the background sits BEHIND the artwork, the artwork itself is copied
// verbatim (no recalouring), the stroke rule is the documented target/scale one
// and skips non-scaling strokes, the artboard describes itself in viewBox and
// width/height, and the SOURCE string is never mutated.
import { describe, expect, it } from "vitest";
import { buildExportSvg, parseAttrs, planExport } from "../src/lib/svgupload/prepare";
import { readMetadata } from "../src/lib/svgupload/mime";

const SRC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#123456" stroke="currentColor"/><path d="M4 4h4"/></svg>`;

const plan = (over: Partial<Parameters<typeof planExport>[0]> = {}) => planExport({
  bounds: { x: 0, y: 0, w: 100, h: 100 },
  padding: { value: 10, unit: "px" },
  stroke: { enabled: false, value: 2.2, unit: "pt" },
  background: null,
  ...over,
});

describe("planExport", () => {
  it("puts the padding, the scale and the content box in one plan", () => {
    const p = plan({ padding: { value: 10, unit: "px" }, outputScale: 2 });
    expect(p.artboard).toEqual({ w: 240, h: 240 });
    expect(p.scale).toBe(2);
    expect(p.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(p.content).toEqual({ x: 20, y: 20, w: 200, h: 200 });
    expect(p.transform).toBe("translate(20 20) scale(2)");
  });

  it("converts a pt padding at the declared 96-dpi convention", () => {
    const p = plan({ padding: { value: 36, unit: "pt" } });
    expect(p.padding.top).toBe(48); // 36 pt = 0.5 in = 48 px
  });

  it("takes a percentage of the shorter side, capped only against a typo", () => {
    const p = plan({ padding: { value: 10, unit: "%" } });
    expect(p.padding.top).toBe(10);
    const big = plan({ bounds: { x: 0, y: 0, w: 100, h: 60 }, padding: { value: 90, unit: "%" } });
    expect(big.padding.top).toBe(54); // 90% of 60 — a real choice, kept
    const typo = plan({ bounds: { x: 0, y: 0, w: 100, h: 60 }, padding: { value: 900, unit: "%" } });
    expect(typo.padding.top).toBe(120); // twice the shorter side, the documented cap
  });

  it("records the stroke rule as target/scale and skips it when disabled", () => {
    const off = plan({ stroke: { enabled: false, value: 2.2, unit: "pt" } });
    expect(off.stroke).toEqual({ applied: false, targetPx: 0, docWidth: 0, factor: null, measuredPx: null });
    const on = plan({ outputScale: 2, stroke: { enabled: true, value: 2.2, unit: "pt" }, documentStrokePx: 1.4 });
    expect(on.stroke.applied).toBe(true);
    expect(on.stroke.targetPx).toBeCloseTo(2.9333, 4); // 2.2 pt
    expect(on.stroke.docWidth).toBeCloseTo(1.4667, 4); // after the 2x transform
    expect(on.stroke.factor).toBeCloseTo(2.0952, 4);   // target / measured
  });

  it("leaves the factor unknown when the document's own stroke is unknown", () => {
    const p = plan({ stroke: { enabled: true, value: 2, unit: "px" }, documentStrokePx: null });
    expect(p.stroke.applied).toBe(true);
    expect(p.stroke.factor).toBeNull();
  });
});

describe("buildExportSvg", () => {
  it("describes the padded artboard in viewBox and width/height", () => {
    const out = buildExportSvg({ source: SRC, plan: plan({ background: null }) });
    const attrs = parseAttrs(out.svg.slice(0, out.svg.indexOf(">")));
    expect(attrs.viewBox).toBe("0 0 120 120");
    expect(attrs.width).toBe("120");
    expect(attrs.height).toBe("120");
    expect(attrs.preserveAspectRatio).toBe("xMidYMid meet");
    expect(attrs.xmlns).toBe("http://www.w3.org/2000/svg");
  });

  it("copies the artwork verbatim — same paths, same colours, no recolouring", () => {
    const out = buildExportSvg({ source: SRC, plan: plan() });
    expect(out.svg).toContain("<path d=\"M2 2h20v20H2z\" fill=\"#123456\" stroke=\"currentColor\"/>");
    expect(out.svg).toContain("<path d=\"M4 4h4\"/>");
    expect(out.warnings).toEqual([]);
  });

  it("wraps the artwork in ONE group carrying the fit transform", () => {
    const out = buildExportSvg({ source: SRC, plan: plan({ padding: { value: 6, unit: "px" } }) });
    expect(out.svg).toContain(`<g class="up-art" transform="translate(6 6) scale(1)">`);
    expect(out.svg.match(/<g class="up-art"/g)).toHaveLength(1);
  });

  it("draws the background BEFORE the artwork, never over it", () => {
    const out = buildExportSvg({ source: SRC, plan: plan({ background: "#ffffff" }) });
    const rectAt = out.svg.indexOf("<rect");
    const artAt = out.svg.indexOf("<g class=\"up-art\"");
    expect(rectAt).toBeGreaterThan(-1);
    expect(rectAt).toBeLessThan(artAt);
    expect(out.svg).toContain(`fill="#ffffff"`);
  });

  it("applies the one stroke rule and exempts non-scaling strokes", () => {
    const out = buildExportSvg({ source: SRC, plan: plan({ stroke: { enabled: true, value: 2.2, unit: "pt" } }) });
    expect(out.svg).toContain(`.up-art *:not([vector-effect="non-scaling-stroke"]){stroke-width:2.9333}`);
  });

  it("emits no stroke rule when the setting is off (the artwork keeps its own)", () => {
    const out = buildExportSvg({ source: SRC, plan: plan() });
    expect(out.svg).not.toContain("stroke-width:");
  });

  it("embeds the accepted metadata as the first children", () => {
    const meta = { title: "The Vector Icon of Focus and Clarity. Razor Sharp.", description: "A square icon for interfaces and print.", tags: ["icon", "vector"] };
    const out = buildExportSvg({ source: SRC, plan: plan({ background: "#ffffff" }), meta });
    expect(readMetadata(out.svg)).toEqual(meta);
    expect(out.svg.indexOf("<title>")).toBeLessThan(out.svg.indexOf("<rect"));
    expect(out.svg.indexOf("<title>")).toBeLessThan(out.svg.indexOf("<g class=\"up-art\""));
    // the packet's prefixes are bound on the ROOT: SVGO's parser (and others)
    // refuse an inner binding, and optimisation must not lose the metadata
    expect(out.svg).toContain(`xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"`);
    expect(out.svg).toContain(`xmlns:dc="http://purl.org/dc/elements/1.1/"`);
  });

  it("warns instead of guessing when the source has no root element", () => {
    const out = buildExportSvg({ source: "<path d=\"M0 0\"/>", plan: plan() });
    expect(out.svg).toBe("<path d=\"M0 0\"/>");
    expect(out.warnings[0]).toContain("no root <svg>");
  });

  it("says which features it cannot reproduce exactly", () => {
    const out = buildExportSvg({ source: "<svg xmlns=\"http://www.w3.org/2000/svg\"><text x=\"1\">A</text></svg>", plan: plan() });
    expect(out.warnings.some((w) => w.includes("<text>"))).toBe(true);
  });

  it("never mutates the source string it was given", () => {
    const before = JSON.stringify(SRC);
    buildExportSvg({ source: SRC, plan: plan({ background: "#000000", stroke: { enabled: true, value: 3, unit: "px" } }) });
    expect(JSON.stringify(SRC)).toBe(before);
    expect(SRC).not.toContain("up-art");
  });

  it("keeps a prolog so the file opens as XML anywhere", () => {
    const out = buildExportSvg({ source: `<?xml version="1.0"?>\n${SRC}`, plan: plan() });
    expect(out.svg.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
  });

  it("preserves xlink declarations the artwork may rely on", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 4 4"><use xlink:href="#a"/></svg>`;
    const out = buildExportSvg({ source: src, plan: plan() });
    expect(out.svg).toContain(`xmlns:xlink="http://www.w3.org/1999/xlink"`);
    expect(out.svg).toContain(`<use xlink:href="#a"/>`);
  });
});
