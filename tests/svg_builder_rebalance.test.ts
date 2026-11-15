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
import { spreadInkBoxes } from "../src/lib/svgBuilder/banner";

// A fake measurer: ink 0.5 × size per character, starting 0.05 × size right of the text's x.
const ink = (text: string, size: number) => ({ width: text.length * size * 0.5, left: size * 0.05, ascent: size * 0.7, descent: size * 0.02 });
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

  it("dev mode: the algorithm's ink boxes and gaps, exactly where it put the texts (2026-11-15)", () => {
    setTextMeasurer((text, size) => ({ width: text.length * size * 0.5, left: size * 0.05, ascent: size * 0.7, descent: size * 0.02 }));
    const { config, svg } = sheet({ title: "MUSHROOM ICONS", subtitle: "Editable stroke width", edgeSpread: true, subtitleCase: "upper" });
    const boxes = spreadInkBoxes(config, computeLayout(config))!;
    const ts = attrOf(svg, "title", "size");
    expect(boxes.title.x).toBeCloseTo(attrOf(svg, "title", "x") + ts * 0.05, 1);
    expect(boxes.title.width).toBeCloseTo(14 * ts * 0.5, 1);
    expect(boxes.gaps).toHaveLength(3);
    for (const g of boxes.gaps) expect(g.width).toBeCloseTo(boxes.gaps[0].width, 1); // equal
    expect(spreadInkBoxes(parseSheetConfig({ ...config, banner: { ...config.banner, edgeSpread: false } }), computeLayout(config))).toBeNull();
  });

  it("the user sets the gap %, the title % of the banner height and the subtitle % of the title (2026-11-15)", () => {
    setTextMeasurer(ink);
    const base = { ...DEFAULT_CONFIG.banner, position: "top" as const, size: 300, title: "MUSHROOM NATURE ICONS SHEET", subtitle: "Editable stroke width" };
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ rowGapPct: 5, titleFillPct: 55, subRatioPct: 42 });
    const small = fitBanner({ ...base, rowGapPct: 5 }, 1080), wide = fitBanner({ ...base, rowGapPct: 20 }, 1080);
    expect(wide.gap).toBeGreaterThanOrEqual(1080 * 0.2); // bigger gaps…
    expect(wide.titleSize).toBeLessThan(small.titleSize); // …smaller texts
    const low = fitBanner({ ...base, size: 100, titleFillPct: 30 }, 1080);
    expect(low.titleSize).toBeLessThanOrEqual(30);
    const ratio = fitBanner({ ...base, size: 100, subRatioPct: 80 }, 1080);
    expect(ratio.subtitleSize / ratio.titleSize).toBeCloseTo(0.8, 1);
    expect(parseSheetConfig({ banner: { rowGapPct: 99, titleFillPct: 1, subRatioPct: 500 } }).banner).toMatchObject({ rowGapPct: 30, titleFillPct: 20, subRatioPct: 100 });
  });

  it("centres each text's ink box on the banner's middle line (Y) (2026-11-15)", () => {
    setTextMeasurer(ink);
    const { config } = sheet({ title: "MUSHROOM ICONS", subtitle: "Editable stroke width", edgeSpread: true, subtitleCase: "upper" });
    const layout = computeLayout(config);
    const boxes = spreadInkBoxes(config, layout)!;
    const mid = layout.banner!.y + layout.banner!.height / 2;
    expect(boxes.title.y + boxes.title.height / 2).toBeCloseTo(mid, 1);
    expect(boxes.sub.y + boxes.sub.height / 2).toBeCloseTo(mid, 1);
  });

  it("split banners too: measured ink boxes, centred, and the dev boxes show (2026-11-15)", () => {
    setTextMeasurer(ink);
    const { config } = sheet({ style: "split", titleSize: 20, title: "MUSHROOM ICONS", subtitle: "Editable stroke width", edgeSpread: true, subtitleCase: "upper" });
    const layout = computeLayout(config);
    const boxes = spreadInkBoxes(config, layout)!;
    expect(boxes).not.toBeNull();
    const mid = layout.banner!.y + layout.banner!.height / 2;
    expect(boxes.title.y + boxes.title.height / 2).toBeCloseTo(mid, 1);
    expect(boxes.sub.y + boxes.sub.height / 2).toBeCloseTo(mid, 1);
    const [left, , right] = boxes.gaps; // block edge → title ink → block end; subtitle centred in the rest
    expect(boxes.gaps).toHaveLength(4);
    expect(left.width).toBeCloseTo(boxes.gaps[1].width, 1);
    expect(right.width).toBeCloseTo(boxes.gaps[3].width, 1);
  });
});
