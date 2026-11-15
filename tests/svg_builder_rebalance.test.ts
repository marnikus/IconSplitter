// @vitest-environment happy-dom
// svg_builder_rebalance.test.ts — ⇔ Rebalance row (2026-11-15): an edge banner's
// row (hero, title, divider, subtitle) on ONE line each, with equal gaps between
// every part and both banner edges.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { edgeXs } from "../src/lib/svgBuilder/banner";
import { canRebalance, rebalancedBanner } from "../src/lib/svgBuilder/rebalance";

const box = { x: 0, y: 0, width: 1000, height: 60 };

describe("rebalance an edge banner row", () => {
  it("equal gaps: edge → title → divider → subtitle → edge", () => {
    const x = edgeXs(box, { hero: 0, title: 200, rule: true, sub: 300 }, true);
    const gap = x.title - box.x;
    expect(x.rule - (x.title + 200)).toBeCloseTo(gap, 6);
    expect(x.sub - x.rule).toBeCloseTo(gap, 6);
    expect(box.x + box.width - (x.sub + 300)).toBeCloseTo(gap, 6);
    expect(gap).toBeCloseTo(125, 6);
  });

  it("with the hero glyph it is one more equal step; without spread the old centred group stays", () => {
    const x = edgeXs(box, { hero: 30, title: 200, rule: false, sub: 300 }, true);
    expect(x.title - (x.hero + 30)).toBeCloseTo(x.hero - box.x, 6);
    const old = edgeXs(box, { hero: 0, title: 200, rule: true, sub: 300 }, false);
    expect(old.title).toBeCloseTo((1000 - (200 + 33 + 300)) / 2, 6);
  });

  it("the button's patch: one line each, spread on, moves and padding cleared", () => {
    const banner = { ...DEFAULT_CONFIG.banner, position: "top" as const, title: "ICON SHEET", subtitle: "Editable stroke width", titleDx: 12, subtitleDy: -4, textPadding: 30 };
    const patch = rebalancedBanner(banner);
    expect(patch).toMatchObject({ edgeSpread: true, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0, textPadding: 0 });
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...banner, ...patch } });
    const svg = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
    const count = (which: string) => ((new RegExp(`data-banner-text="${which}"[\\s\\S]*?</g>`).exec(svg)?.[0] ?? "").match(/<text/g) ?? []).length;
    expect(count("title")).toBe(1);
    expect(count("subtitle")).toBe(1);
    expect(canRebalance({ ...banner, position: "top", style: "solid" })).toBe(true);
    expect(canRebalance({ ...banner, position: "left", style: "solid" })).toBe(false);
    expect(parseSheetConfig({ banner: {} }).banner.edgeSpread).toBe(false);
  });

  it("Auto rebalance keeps the row balanced whatever the texts become: one line each, spread, no moves (2026-11-15)", () => {
    const banner = { ...DEFAULT_CONFIG.banner, position: "top" as const, style: "solid" as const, title: "a much longer title than before for this sheet", titleWidth: 120, titleDx: 40, autoRebalance: true };
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner });
    const svg = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
    const block = new RegExp(`data-banner-text="title"[\\s\\S]*?</g>`).exec(svg)?.[0] ?? "";
    expect((block.match(/<text/g) ?? []).length).toBe(1); // the stored 120 px width is ignored: one line
    const off = composeSheet({ config: parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...banner, autoRebalance: false } }), layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
    expect(((new RegExp(`data-banner-text="title"[\\s\\S]*?</g>`).exec(off)?.[0] ?? "").match(/<text/g) ?? []).length).toBeGreaterThan(1);
    expect(parseSheetConfig({ banner: {} }).banner.autoRebalance).toBe(false);
  });

  it("a split top banner rebalances too: icon + title evenly in the block, the subtitle centred in the rest (2026-11-15)", () => {
    expect(canRebalance({ position: "top", style: "split" })).toBe(true);
    const banner = { ...DEFAULT_CONFIG.banner, position: "top" as const, style: "split" as const, size: 90, hero: false, titleSize: 22, title: "bakery and dessert icons", subtitle: "Editable stroke width" };
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...banner, ...rebalancedBanner(banner) } });
    const svg = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
    const block = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*data-split-block/.exec(svg)!;
    const [bx, bw] = [Number(block[1]), Number(block[2])];
    const titleX = Number(/data-banner-text="title"[\s\S]*?<text x="([\d.]+)"/.exec(svg)![1]);
    const subX = Number(/data-banner-text="subtitle"[\s\S]*?<text x="([\d.]+)"/.exec(svg)![1]);
    const titleW = config.banner.title.length * config.banner.titleSize * 0.56;
    expect(titleX - bx).toBeCloseTo(bx + bw - (titleX + titleW), 0); // equal space both sides inside the block
    const subW = config.banner.subtitle.toUpperCase().length * config.banner.subtitleSize * 0.72;
    expect(subX - (bx + bw)).toBeCloseTo(config.artboard.width - (subX + subW), 0); // centred in the rest
  });
});
