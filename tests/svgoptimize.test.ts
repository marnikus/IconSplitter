// svgoptimize.test.ts — SVGO runs for real (RULE 8), and the equivalence gate
// is proven to catch a moved shape, a dropped fill and a changed stroke.
import { describe, expect, it } from "vitest";
import { compareStructures, optimizeSvg, SVGO_CONFIG, SVGO_VERSION } from "../src/lib/svgoptimize";

const messy = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + "<!-- a comment -->"
  + '<g id="layer"><rect x="10" y="10" width="80.12345" height="80" fill="#ff0000" stroke="#000000" stroke-width="6"/></g></svg>';

describe("optimizeSvg", () => {
  it("shrinks the document and reports both sizes and the version", () => {
    const result = optimizeSvg(messy);
    expect(result.ok).toBe(true);
    expect(result.version).toBe(SVGO_VERSION);
    expect(result.afterBytes).toBeLessThan(result.beforeBytes);
    expect(result.code).not.toContain("a comment");
    expect(result.code).toContain("80.123"); // float precision from the pinned config
  });

  it("keeps the viewBox, the ids and the shape types the config protects", () => {
    const out = optimizeSvg(messy).code;
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('id="layer"');
    expect(out).toContain("<rect");
    expect(out).not.toContain("<path");
  });

  it("leaves the document untouched, with the reason, when the optimiser fails", () => {
    // A document with no root element makes SVGO throw; the export must survive it.
    const result = optimizeSvg("not svg at all");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not svg at all");
    expect(result.error).not.toBeNull();
  });

  it("is deterministic: the same input gives the same output", () => {
    expect(optimizeSvg(messy).code).toBe(optimizeSvg(messy).code);
  });

  it("records a configuration that can be read back", () => {
    expect(SVGO_CONFIG.plugins[0].params.overrides.mergePaths).toBe(false);
    expect(SVGO_CONFIG.plugins[0].params.overrides.removeDesc).toBe(false);
    expect(SVGO_CONFIG.plugins.map((plugin) => plugin.name)).toEqual(["preset-default"]);
  });

  it("keeps the title svgo 4 would drop if it were named as a plugin", () => {
    // Listing `removeTitle` anywhere in `plugins` runs it (svgo 4 ignores the
    // old `active: false` flag) and the title disappears with it.
    const titled = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
      + "<title>Rounded bolt</title><desc>An editable line pictogram of a bolt.</desc>"
      + '<path d="M4 12h16" fill="none" stroke="#111" stroke-width="2.2"/></svg>';
    const out = optimizeSvg(titled).code;
    expect(out).toContain("<title>Rounded bolt</title>");
    expect(out).toContain("<desc>");
  });
});

describe("compareStructures", () => {
  it("passes for an unoptimised document against itself", () => {
    const check = compareStructures(messy, messy);
    expect(check.ok).toBe(true);
    expect(check.evidence.elements).toBeGreaterThan(0);
    expect(check.evidence.strokeWidths).toEqual(["6"]);
  });

  it("passes for the optimised document — same geometry, same ink", () => {
    const check = compareStructures(messy, optimizeSvg(messy).code);
    expect(check.differences).toEqual([]);
  });

  it("catches moved geometry even when the element census matches", () => {
    const moved = messy.replace('x="10"', 'x="40"');
    expect(compareStructures(messy, moved).differences.join(" ")).toContain("geometry moved");
  });

  it("catches a dropped fill and an added element", () => {
    expect(compareStructures(messy, messy.replace('fill="#ff0000"', "")).differences.join(" ")).toContain("fills");
    const added = messy.replace("</g>", "</g><circle cx=\"5\" cy=\"5\" r=\"1\"/></svg>").replace("</svg></svg>", "</svg>");
    expect(compareStructures(messy, added).differences.length).toBeGreaterThan(0);
  });

  it("catches a changed stroke width, which is the stroke-to-outline risk", () => {
    const thicker = messy.replace('stroke-width="6"', 'stroke-width="7"');
    // A thicker stroke is caught twice over: the declaration and the ink box.
    expect(compareStructures(messy, thicker).differences.join(" ")).toMatch(/stroke-widths|geometry moved/);
  });

  it("says honestly when a document cannot be measured at all", () => {
    expect(compareStructures("<svg><", "<svg><").differences).toEqual([]);
    expect(compareStructures("<svg><", messy).differences.join(" ")).toContain("could not be measured");
  });
});
