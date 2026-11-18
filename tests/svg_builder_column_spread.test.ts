// @vitest-environment happy-dom
// svg_builder_column_spread.test.ts — the reference text rule on vertical column
// banners (left / right, 2026-11-17): the same principle as the edge row, with the
// axes swapped — the distances (edge g · title · 2g · subtitle · g) are measured
// VERTICALLY between the texts' real ink blocks, every line's ink is centred on
// the column's middle line (X), and the hero glyph (else the divider) sits exactly
// in the middle of the double gap. ▦ Guides shows the ink blocks and the gaps with
// their px, exactly as for the row. The rule is also the DEFAULT for new designs
// and migrates every saved template with a banner it applies to.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, applyPresetConfig, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { setTextMeasurer } from "../src/lib/svgBuilder/measure";
import { canRebalance } from "../src/lib/svgBuilder/rebalance";
import { spreadInkBoxes } from "../src/lib/svgBuilder/banner";
import { newTemplate, parseTemplates } from "../src/lib/svgBuilder/templates";
import { readableInk } from "../src/lib/svgBuilder/config";

// The same fake measurer the row tests use: ink 0.5 × size per character, from 0.05 × size.
const ink = (text: string, size: number) => ({ width: text.length * size * 0.5, left: size * 0.05, ascent: size * 0.7, descent: size * 0.02 });
afterEach(() => setTextMeasurer(null));

const sheet = (banner: Partial<typeof DEFAULT_CONFIG.banner>, artboard: Partial<typeof DEFAULT_CONFIG.artboard> = {}) => {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, artboard: { ...DEFAULT_CONFIG.artboard, ...artboard },
    banner: { ...DEFAULT_CONFIG.banner, hero: false, divider: false, ...banner } });
  const layout = computeLayout(config);
  return { config, layout, svg: composeSheet({ config, layout, assets: [], placedIds: [], svgTexts: {} }).svg };
};
/** The drawn texts of one block: [x, baseline y, size] per line. */
const linesOf = (svg: string, which: string) => [...(new RegExp(`data-banner-text="${which}"[\\s\\S]*?</g>`).exec(svg)?.[0] ?? "").matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.-]+)"/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]) }));

describe("the reference rule on a vertical column banner", () => {
  it("spaces the ink blocks edge g · title · 2g · subtitle · g, measured vertically", () => {
    setTextMeasurer(ink);
    const { config, layout, svg } = sheet({ edgeSpread: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const tl = linesOf(svg, "title"), sl = linesOf(svg, "subtitle");
    const tTop = tl[0].y - tl[0].size * 0.7, tBot = tl[tl.length - 1].y + tl[tl.length - 1].size * 0.02;
    const sTop = sl[0].y - sl[0].size * 0.7, sBot = sl[sl.length - 1].y + sl[sl.length - 1].size * 0.02;
    const g = (box.height - (tBot - tTop) - (sBot - sTop)) / 4;
    expect(g).toBeGreaterThan(0);
    expect(tTop - box.y).toBeCloseTo(g, 0); // one space on the top edge
    expect(sTop - tBot).toBeCloseTo(2 * g, 0); // twice the space between the texts
    expect(box.y + box.height - sBot).toBeCloseTo(g, 0); // one space on the bottom edge
    expect(config.banner.titleSize).toBe(32); // the column keeps the user's sizes…
    expect(config.banner.subtitleSize).toBe(9);
  });

  it("centres every line's ink on the column's middle line (X)", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, titleWidth: 200, subtitleWidth: 60, titleSize: 32, subtitleSize: 9 });
    const cx = layout.banner!.x + layout.banner!.width / 2;
    for (const line of linesOf(svg, "title")) {
      const w = 10 * line.size * 0.5; // "ICON SHEET" on one line (titleWidth 200)
      expect(line.x + line.size * 0.05 + w / 2).toBeCloseTo(cx, 0);
    }
    const subs = linesOf(svg, "subtitle");
    expect(subs.length).toBe(3); // subtitleWidth 60 wraps EDITABLE / STROKE / WIDTH
    for (const line of subs) {
      const w = line === subs[0] ? 8 * line.size * 0.5 : line === subs[1] ? 6 * line.size * 0.5 : 5 * line.size * 0.5;
      expect(line.x + line.size * 0.05 + w / 2).toBeCloseTo(cx, 0);
    }
  });

  it("puts the divider, else the hero, exactly in the middle of the double gap", () => {
    setTextMeasurer(ink);
    const rule = sheet({ edgeSpread: true, divider: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const tl = linesOf(rule.svg, "title"), sl = linesOf(rule.svg, "subtitle");
    const tBot = tl[0].y + tl[0].size * 0.02, sTop = sl[0].y - sl[0].size * 0.7;
    const at = /<rect x="[\d.-]+" y="([\d.-]+)"[^>]*data-accent-rule/.exec(rule.svg)!;
    expect(Number(at[1]) + 1).toBeCloseTo((tBot + sTop) / 2, 0);
    const hero = sheet({ edgeSpread: true, hero: true, divider: false, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const ht = linesOf(hero.svg, "title"), hs = linesOf(hero.svg, "subtitle");
    const hBot = ht[0].y + ht[0].size * 0.02, hTopS = hs[0].y - hs[0].size * 0.7;
    const cy = Number(/<circle cx="[\d.-]+" cy="([\d.-]+)"[^>]*data-banner-ring/.exec(hero.svg)![1]);
    expect(cy).toBeCloseTo((hBot + hTopS) / 2, 0);
  });

  it("shrinks both sizes by one factor when the gaps fall below the minimum", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, titleWidth: 400, subtitleWidth: 400, titleSize: 120, subtitleSize: 60 },
      { height: 240 });
    const box = layout.banner!;
    const tl = linesOf(svg, "title"), sl = linesOf(svg, "subtitle");
    const ts = tl[0].size, ss = sl[0].size;
    expect(ts).toBeLessThan(120); // shrunk…
    expect(ss / ts).toBeCloseTo(0.5, 1); // …by one factor
    const tTop = tl[0].y - ts * 0.7, sBot = sl[0].y + ss * 0.02;
    const g = Math.min(tTop - box.y, box.y + box.height - sBot);
    expect(g).toBeGreaterThanOrEqual(box.height * 0.05 - 0.5);
  });

  it("split column: the colour seam takes the divider's place in the middle of the double gap", () => {
    setTextMeasurer(ink);
    const { config, svg } = sheet({ style: "split", edgeSpread: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const block = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"[^>]*data-split-block/.exec(svg)!;
    const seam = Number(block[2]) + Number(block[4]);
    const tl = linesOf(svg, "title"), sl = linesOf(svg, "subtitle");
    const tBot = tl[0].y + tl[0].size * 0.02, sTop = sl[0].y - sl[0].size * 0.7;
    expect(seam).toBeCloseTo((tBot + sTop) / 2, 0);
    expect(tl[0].y).toBeLessThan(seam); // the title stays on its colour
    expect(sl[0].y).toBeGreaterThan(seam);
    const fill = /data-banner-text="title"[\s\S]*?<text[^>]*fill="([^"]+)"/.exec(svg)![1].toUpperCase();
    expect(fill).toBe(readableInk(config.banner.accent).toUpperCase());
  });

  it("▦ Guides: the ink blocks and the three vertical gaps, with the middle one double", () => {
    setTextMeasurer(ink);
    const { config, layout } = sheet({ edgeSpread: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const boxes = spreadInkBoxes(config, layout)!;
    expect(boxes.gaps).toHaveLength(3);
    for (const g of boxes.gaps) expect(g.height).toBeGreaterThan(g.width); // vertical bars
    expect(boxes.gaps[1].height).toBeCloseTo(2 * boxes.gaps[0].height, 0);
    expect(boxes.gaps[2].height).toBeCloseTo(boxes.gaps[0].height, 0);
    const svg = composeSheet({ config, layout, assets: [], placedIds: [], svgTexts: {} }).svg;
    const tl = linesOf(svg, "title")[0];
    expect(boxes.title.y).toBeCloseTo(tl.y - tl.size * 0.7, 0); // exactly the drawn ink
    expect(boxes.title.x + boxes.title.width / 2).toBeCloseTo(layout.banner!.x + layout.banner!.width / 2, 0);
    expect(spreadInkBoxes(parseSheetConfig({ ...config, banner: { ...config.banner, edgeSpread: false, autoRebalance: false } }), layout)).toBeNull();
  });

  it("applies to every column and every row, never to a plain grid", () => {
    expect(canRebalance({ position: "left", style: "solid" })).toBe(true);
    expect(canRebalance({ position: "right", style: "split" })).toBe(true);
    expect(canRebalance({ position: "top", style: "solid" })).toBe(true);
    expect(canRebalance({ position: "bottom", style: "split" })).toBe(true);
    expect(canRebalance({ position: "none", style: "solid" })).toBe(false);
  });
});

describe("the rule is the default for new designs and migrates saved templates", () => {
  it("a new sheet rebalances automatically", () => {
    expect(DEFAULT_CONFIG.banner.autoRebalance).toBe(true);
    expect(applyPresetConfig(parseSheetConfig(DEFAULT_CONFIG), "masthead").banner.autoRebalance).toBe(true);
    expect(applyPresetConfig(parseSheetConfig(DEFAULT_CONFIG), "editorial").banner.autoRebalance).toBe(true);
    // a stored sheet keeps the user's explicit opt-out
    expect(parseSheetConfig({ banner: { autoRebalance: false } }).banner.autoRebalance).toBe(false);
  });

  it("every saved template with a row or column banner carries the rule", () => {
    const raw = (position: string) => [{ id: "t", name: "T", created: "", updated: "", config: { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position, autoRebalance: false, edgeSpread: false } } }];
    for (const position of ["top", "bottom", "left", "right"]) {
      const [template] = parseTemplates(raw(position));
      expect(template.config.banner.autoRebalance).toBe(true);
    }
    const [plain] = parseTemplates(raw("none"));
    expect(plain.config.banner.autoRebalance).toBe(false);
    const made = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", autoRebalance: false } }), [], "now", "id");
    expect(made.config.banner.autoRebalance).toBe(true);
  });
});
