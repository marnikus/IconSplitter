// @vitest-environment happy-dom
// svg_builder_rebalance.test.ts — ⇔ Rebalance row (2026-11-15, v3): the texts'
// REAL ink boxes (measure.ts) decide the layout; the sizes are the OPTIMAL ones
// for the banner's whole space (grown or shrunk), title and subtitle each on one
// line, three equal gaps between the ink edges and the banner edges, the hero
// (else the divider) exactly in the middle between the texts.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { setTextMeasurer } from "../src/lib/svgBuilder/measure";
import { canRebalance, fitBanner, rebalancedBanner, ROW_MIN_GAP } from "../src/lib/svgBuilder/rebalance";

// A fake measurer: ink 0.5 × size per character, starting 0.05 × size right of the text's x.
const ink = (text: string, size: number) => ({ width: text.length * size * 0.5, left: size * 0.05 });
afterEach(() => setTextMeasurer(null));

const sheet = (banner: Partial<typeof DEFAULT_CONFIG.banner>) => {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", style: "solid", size: 100, hero: false, ...banner } });
  return { config, svg: composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg };
};
const attrOf = (svg: string, which: string, name: string) => Number(new RegExp(`data-banner-text="${which}"[\\s\\S]*?<text x="([\\d.]+)"[^>]*font-size="([\\d.]+)"`).exec(svg)![name === "x" ? 1 : 2]);
const lines = (svg: string, which: string) => ((new RegExp(`data-banner-text="${which}"[\\s\\S]*?</g>`).exec(svg)?.[0] ?? "").match(/<text/g) ?? []).length;

describe("rebalance a top / bottom banner row", () => {
  it("measures the real ink edges: three equal gaps between them and the banner edges", () => {
    setTextMeasurer(ink);
    const { svg } = sheet({ title: "MUSHROOM NATURE ICONS SHEET", subtitle: "Editable stroke width", edgeSpread: true, titleCase: "upper", subtitleCase: "upper" });
    const ts = attrOf(svg, "title", "size"), ss = attrOf(svg, "subtitle", "size");
    const t0 = attrOf(svg, "title", "x") + ts * 0.05, t1 = t0 + 27 * ts * 0.5; // the title's ink
    const s0 = attrOf(svg, "subtitle", "x") + ss * 0.05, s1 = s0 + 21 * ss * 0.5;
    expect(s0 - t1).toBeCloseTo(t0, 0);
    expect(1080 - s1).toBeCloseTo(t0, 0);
    expect(t0).toBeGreaterThanOrEqual(1080 * ROW_MIN_GAP - 0.5);
    expect(lines(svg, "title")).toBe(1);
    expect(lines(svg, "subtitle")).toBe(1);
  });

  it("finds the optimal sizes for the banner's space: a tiny subtitle grows, an oversized title shrinks", () => {
    setTextMeasurer(ink);
    const banner = { ...DEFAULT_CONFIG.banner, position: "top" as const, size: 100, title: "MUSHROOM NATURE ICONS SHEET", subtitle: "Editable stroke width", titleSize: 48, subtitleSize: 9 };
    const fit = fitBanner(banner, 1080);
    expect(fit.subtitleSize).toBeGreaterThan(9); // grown into the space
    expect(fit.titleSize).toBeLessThanOrEqual(100 * 0.55);
    expect(fit.subtitleSize / fit.titleSize).toBeCloseTo(0.42, 1);
    const tall = fitBanner({ ...banner, size: 300 }, 1080);
    expect(tall.gap).toBeGreaterThanOrEqual(1080 * ROW_MIN_GAP); // limited by the width: gaps at the minimum…
    expect(tall.gap).toBeLessThan(1080 * ROW_MIN_GAP + 10); // …give or take the whole-pixel sizes
    const patch = rebalancedBanner(banner, 1080);
    expect(patch).toMatchObject({ edgeSpread: true, titleSize: fit.titleSize, subtitleSize: fit.subtitleSize, textPadding: 0, titleDx: 0 });
  });

  it("the hero glyph (else the divider) sits exactly in the middle between the texts' ink", () => {
    setTextMeasurer(ink);
    const { svg } = sheet({ title: "MUSHROOM ICONS", subtitle: "Editable stroke width", divider: true, edgeSpread: true, subtitleCase: "upper" });
    const ts = attrOf(svg, "title", "size"), ss = attrOf(svg, "subtitle", "size");
    const t1 = attrOf(svg, "title", "x") + ts * 0.05 + 14 * ts * 0.5;
    const s0 = attrOf(svg, "subtitle", "x") + ss * 0.05;
    const rule = Number(/<rect x="([\d.]+)"[^>]*data-accent-rule/.exec(svg)![1]);
    expect(rule).toBeCloseTo((t1 + s0) / 2, 0);
  });

  it("without a browser measurer it still lays out (estimated); edge banners only", () => {
    const { svg } = sheet({ title: "a much longer title than before for this sheet", titleWidth: 120, autoRebalance: true });
    expect(lines(svg, "title")).toBe(1);
    expect(canRebalance({ position: "top", style: "solid" })).toBe(true);
    expect(canRebalance({ position: "left", style: "solid" })).toBe(false);
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ edgeSpread: false, autoRebalance: false });
  });
});
