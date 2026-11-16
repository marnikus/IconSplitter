// @vitest-environment happy-dom
// svg_builder_tracking.test.ts — banner title / subtitle letter spacing (2026-11-15):
// an offset in hundredths of an em added to each text's own spacing (title
// −0.045em sans / −0.02em serif, subtitle 0.16em); 0 keeps the old look; the
// rebalance measures with it.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { RANGES } from "../src/lib/svgBuilder/ranges";
import { setTextMeasurer } from "../src/lib/svgBuilder/measure";
import { subtitleStyle, titleStyle } from "../src/lib/svgBuilder/rebalance";

afterEach(() => setTextMeasurer(null));
const svgOf = (banner: Partial<typeof DEFAULT_CONFIG.banner>) => {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", size: 90, ...banner } });
  return composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
};
const spacing = (svg: string, which: string) => new RegExp(`data-banner-text="${which}"[\\s\\S]*?letter-spacing="([^"]+)"`).exec(svg)![1];

describe("banner letter spacing", () => {
  it("0 keeps the old spacing; older configs read 0; the range clamps", () => {
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ titleTracking: 0, subtitleTracking: 0 });
    expect(spacing(svgOf({}), "title")).toBe("-0.045em");
    expect(spacing(svgOf({}), "subtitle")).toBe("0.16em");
    expect(spacing(svgOf({ titleFace: "serif" }), "title")).toBe("-0.02em");
    expect(parseSheetConfig({ banner: { titleTracking: 999 } }).banner.titleTracking).toBe(RANGES.tracking.max);
  });

  it("an offset adds to each text's own spacing", () => {
    expect(spacing(svgOf({ titleTracking: 10 }), "title")).toBe("0.055em");
    expect(spacing(svgOf({ subtitleTracking: -6 }), "subtitle")).toBe("0.1em");
  });

  it("the rebalance measures with the same spacing", () => {
    expect(titleStyle({ ...DEFAULT_CONFIG.banner, titleTracking: 10 }).spacingEm).toBeCloseTo(0.055, 6);
    expect(subtitleStyle({ ...DEFAULT_CONFIG.banner, subtitleTracking: 4 }).spacingEm).toBeCloseTo(0.2, 6);
  });
});
