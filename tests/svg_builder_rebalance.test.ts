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
});
