// @vitest-environment happy-dom
// svg_builder_tracking.test.ts — banner title / subtitle letter spacing (2026-11-15):
// an offset in hundredths of an em added to each text's own spacing (title
// −0.045 sans / −0.02 serif, subtitle 0.16); 0 keeps the old look; the
// rebalance measures with it.
// 2026-11-19: the SHEET writes that spacing in px at the run's own size, not as an
// em string — the shared text outliner adds px per glyph, so an em fraction became
// 0 there and the exported EPS (and an expanded SVG) lost the spacing the artboard
// showed. The em fractions are still the model; the file carries their px.
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
/** The first run of one text block, as the px it writes and the size it writes it for. */
const runOf = (svg: string, which: string) => {
  const tag = new RegExp(`data-banner-text="${which}"[\\s\\S]*?(<text[^>]*>)`).exec(svg)![1];
  return { px: Number(/letter-spacing="([^"]+)"/.exec(tag)![1]), size: Number(/font-size="([^"]+)"/.exec(tag)![1]) };
};
/**
 * The spacing a block writes, read back as the em fraction the model uses: the
 * written px divided by the run's own font size (4-decimal px rounding allowed).
 */
const expectEm = (svg: string, which: "title" | "subtitle", em: number) => {
  const run = runOf(svg, which);
  expect(run.size).toBeGreaterThan(0);
  expect(run.px / run.size).toBeCloseTo(em, 3);
  // And that is the px a consumer adds — written at RULE 26's one decimal, so a
  // 32 px run's 0.8 px can land on 0.8 and never on 0.825.
  expect(run.px).toBeCloseTo(em * run.size, 1);
};

describe("banner letter spacing", () => {
  it("0 keeps the old spacing; older configs read 0; the range clamps", () => {
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ titleTracking: 0, subtitleTracking: 0 });
    expectEm(svgOf({}), "title", -0.045);
    expectEm(svgOf({}), "subtitle", 0.16);
    expectEm(svgOf({ titleFace: "serif" }), "title", -0.02);
    expect(parseSheetConfig({ banner: { titleTracking: 999 } }).banner.titleTracking).toBe(RANGES.tracking.max);
  });

  it("an offset adds to each text's own spacing", () => {
    expectEm(svgOf({ titleTracking: 10 }), "title", 0.055);
    expectEm(svgOf({ subtitleTracking: -6 }), "subtitle", 0.1);
  });

  it("the rebalance measures with the same spacing", () => {
    expect(titleStyle({ ...DEFAULT_CONFIG.banner, titleTracking: 10 }).spacingEm).toBeCloseTo(0.055, 6);
    expect(subtitleStyle({ ...DEFAULT_CONFIG.banner, subtitleTracking: 4 }).spacingEm).toBeCloseTo(0.2, 6);
  });
});
