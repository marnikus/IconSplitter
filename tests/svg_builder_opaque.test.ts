// @vitest-environment happy-dom
// svg_builder_opaque.test.ts — the final artwork has NO transparency (2026-11-14):
// rings, divider rules and icons are solid colours, every banner style.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { solidMix } from "../src/lib/svgBuilder/solidcolor";

const asset = { id: "a", base: "x", suffix: "", label: "x", category: "c", tags: [], svgPath: "x.svg", svgName: "x.svg", version: 1, fingerprint: "f", metaPath: "x.json", approved: true as const };
const SEMI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" opacity="0.5"><g opacity="0.7"><path d="M3 3h18v18H3z" stroke-opacity="0.4" fill-opacity="0.2"/></g></svg>';

function sheet(banner: Partial<typeof DEFAULT_CONFIG.banner>): string {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, hero: true, divider: true, title: "Title", subtitle: "Sub", ...banner } });
  return composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: SEMI } }).svg;
}

describe("no transparency in the final artwork", () => {
  it("mixes a colour onto its surface as one solid hex", () => {
    expect(solidMix("#FFFFFF", "#000000", 0.3)).toBe("#4D4D4D");
    expect(solidMix("#ff0000", "#0000ff", 1)).toBe("#FF0000");
    expect(solidMix("#ff0000", "#0000ff", 0)).toBe("#0000FF");
  });

  for (const style of ["solid", "split"] as const) {
    for (const position of ["left", "top"] as const) {
      it(`${style} banner on the ${position}: no opacity anywhere`, () => {
        const svg = sheet({ style, position });
        expect(svg).not.toMatch(/opacity|rgba\(|transparent/i);
      });
    }
  }

  it("both circle rings are the FULL accent colour, never faded (2026-11-14)", () => {
    const svg = sheet({ style: "solid", position: "left", accent: "#C8641E", background: "#A8EEE6" });
    const rings = [...svg.matchAll(/<circle[^>]*data-banner-ring="true"[^>]*>/g)].map((m) => m[0]);
    expect(rings).toHaveLength(2);
    for (const ring of rings) expect(ring).toContain('stroke="#C8641E"');
  });

  it("on the split block (filled with the accent) the rings take the icon's ink, so they stay visible", () => {
    const svg = sheet({ style: "split", position: "left", accent: "#C8641E", background: "#A8EEE6" });
    const rings = [...svg.matchAll(/<circle[^>]*data-banner-ring="true"[^>]*>/g)].map((m) => m[0]);
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings) expect(ring).not.toContain('stroke="#C8641E"');
  });
});
