// @vitest-environment happy-dom
// svg_builder_rebalance.test.ts — ⇔ Rebalance row (2026-11-15, new rules): a top /
// bottom banner's title and subtitle each on ONE line with THREE equal gaps
// (edge → title → subtitle → edge); too long → both texts shrink together until
// every gap is at least 5 % of the row; the hero glyph (else the divider) sits
// exactly in the middle of the gap between the texts.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { canRebalance, fitRow, rebalancedBanner, ROW_MIN_GAP } from "../src/lib/svgBuilder/rebalance";

const sheet = (banner: Partial<typeof DEFAULT_CONFIG.banner>) => {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", style: "solid", size: 90, hero: false, ...banner } });
  return { config, svg: composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg };
};
const xOf = (svg: string, which: string) => Number(new RegExp(`data-banner-text="${which}"[\\s\\S]*?<text x="([\\d.]+)"`).exec(svg)![1]);
const lines = (svg: string, which: string) => ((new RegExp(`data-banner-text="${which}"[\\s\\S]*?</g>`).exec(svg)?.[0] ?? "").match(/<text/g) ?? []).length;

describe("rebalance a top / bottom banner row", () => {
  it("fits: three equal gaps when the texts fit; both shrink together when they do not", () => {
    expect(fitRow({ width: 1000, title: 300, sub: 200, hero: 0 })).toEqual({ scale: 1, gap: (1000 - 500) / 3 });
    const tight = fitRow({ width: 1000, title: 700, sub: 500, hero: 0 });
    expect(tight.scale).toBeLessThan(1);
    expect(tight.gap).toBeCloseTo(1000 * ROW_MIN_GAP, 6); // shrunk exactly to the minimum gap
    expect(1200 * tight.scale + 3 * tight.gap).toBeCloseTo(1000, 6);
    const withHero = fitRow({ width: 1000, title: 300, sub: 200, hero: 200 });
    expect(withHero.gap).toBeGreaterThanOrEqual(200 + 1000 * ROW_MIN_GAP); // the middle gap holds the hero with room
  });

  it("draws one line each with equal gaps edge → title → subtitle → edge", () => {
    const banner = { title: "MUSHROOM NATURE ICONS SHEET", subtitle: "Editable stroke width", titleSize: 30 };
    const { config, svg } = sheet({ ...banner, ...rebalancedBanner({ ...DEFAULT_CONFIG.banner, ...banner, position: "top" }, 1080) });
    expect(lines(svg, "title")).toBe(1);
    expect(lines(svg, "subtitle")).toBe(1);
    const titleW = config.banner.title.length * config.banner.titleSize * 0.56;
    const subW = config.banner.subtitle.toUpperCase().length * config.banner.subtitleSize * 0.72;
    const t = xOf(svg, "title"), s = xOf(svg, "subtitle");
    expect(s - (t + titleW)).toBeCloseTo(t, 0);
    expect(1080 - (s + subW)).toBeCloseTo(t, 0);
  });

  it("too long: the button shrinks both sizes so the gaps stay at least 5 %", () => {
    const banner = { ...DEFAULT_CONFIG.banner, position: "top" as const, title: "A VERY LONG MUSHROOM NATURE ICONS SHEET TITLE", subtitle: "Editable stroke width for every icon", titleSize: 48, subtitleSize: 24 };
    const patch = rebalancedBanner(banner, 1080);
    expect(patch.titleSize!).toBeLessThan(48);
    expect(patch.subtitleSize!).toBeLessThan(24);
    expect(patch.titleSize! / 48).toBeCloseTo(patch.subtitleSize! / 24, 1); // the same factor
    const { svg } = sheet({ ...banner, ...patch });
    expect(xOf(svg, "title")).toBeGreaterThanOrEqual(1080 * ROW_MIN_GAP - 1);
  });

  it("the hero glyph (else the divider) sits exactly in the middle between the texts", () => {
    const banner = { title: "MUSHROOM ICONS", subtitle: "Editable stroke width", hero: false, divider: true };
    const { config, svg } = sheet({ ...banner, ...rebalancedBanner({ ...DEFAULT_CONFIG.banner, ...banner, position: "top" }, 1080) });
    const t = xOf(svg, "title"), s = xOf(svg, "subtitle");
    const titleEnd = t + config.banner.title.length * config.banner.titleSize * 0.56;
    const rule = Number(/<rect x="([\d.]+)"[^>]*data-accent-rule/.exec(svg)![1]);
    expect(rule).toBeCloseTo((titleEnd + s) / 2, 0);
  });

  it("edge banners only; Auto rebalance draws one line whatever width was stored", () => {
    expect(canRebalance({ position: "top", style: "solid" })).toBe(true);
    expect(canRebalance({ position: "bottom", style: "split" })).toBe(true);
    expect(canRebalance({ position: "left", style: "solid" })).toBe(false);
    const auto = sheet({ title: "a much longer title than before for this sheet", titleWidth: 120, titleDx: 40, autoRebalance: true });
    expect(lines(auto.svg, "title")).toBe(1);
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ edgeSpread: false, autoRebalance: false });
  });
});
