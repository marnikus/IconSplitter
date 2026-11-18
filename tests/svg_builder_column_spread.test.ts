// @vitest-environment happy-dom
// svg_builder_column_spread.test.ts — the reference rule on vertical column
// banners (2026-11-17, redefined against the reference frame): the column is a
// STACK — hero glyph, accent rule, title, subtitle — spaced vertically with
//   x        on the top and bottom edges,
//   1/3 · x  between every two neighbouring objects that are present,
// so turning the hero or the rule off keeps 1/3 · x between the rest and x on
// the edges (x follows from the banner's height and the objects' ink). Every
// line's ink is centred on the column's middle line; ▦ Guides draws the ink
// blocks and the vertical gap bars with their px. The rule is the default for
// new designs and migrates every saved template with a row or column banner.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, applyPresetConfig, parseSheetConfig, readableInk } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { setTextMeasurer } from "../src/lib/svgBuilder/measure";
import { canRebalance } from "../src/lib/svgBuilder/rebalance";
import { spreadInkBoxes } from "../src/lib/svgBuilder/banner";
import { newTemplate, parseTemplates } from "../src/lib/svgBuilder/templates";

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
const heroCyOf = (svg: string) => Number(/<circle cx="[\d.-]+" cy="([\d.-]+)"[^>]*data-banner-ring/.exec(svg)![1]);
const ruleYOf = (svg: string) => Number(/<rect x="[\d.-]+" y="([\d.-]+)"[^>]*data-accent-rule/.exec(svg)![1]);

/** The stack's geometry as the reference defines it: x on the edges, 1/3 · x between neighbours. */
function stack(box: { y: number; height: number }, heights: readonly number[]) {
  const x = (box.height - heights.reduce((s, h) => s + h, 0)) / (2 + (heights.length - 1) / 3);
  const tops: number[] = [];
  let cur = box.y + x;
  for (const h of heights) { tops.push(cur); cur += h + x / 3; }
  return { x, tops };
}
const T = (size: number) => size * 0.72; // one title line's ink with the fake measurer
const S = (size: number) => size * 0.72; // one subtitle line's ink
const HERO_D = 118; // ring diameter at a 242-wide column (heroSize)
const RULE_H = 2;

describe("the reference stack on a vertical column banner", () => {
  it("hero, accent rule, title, subtitle: x on the edges, 1/3 · x between neighbours", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, hero: true, divider: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const { x, tops } = stack(box, [HERO_D, RULE_H, T(32), S(9)]);
    expect(heroCyOf(svg)).toBeCloseTo(tops[0] + HERO_D / 2, 0);
    expect(ruleYOf(svg)).toBeCloseTo(tops[1], 0);
    expect(linesOf(svg, "title")[0].y - 32 * 0.7).toBeCloseTo(tops[2], 0); // the title's ink top
    expect(linesOf(svg, "subtitle")[0].y - 9 * 0.7).toBeCloseTo(tops[3], 0);
    expect(tops[3] + S(9) + x).toBeCloseTo(box.y + box.height, 0); // and x on the bottom edge
    expect(x).toBeGreaterThan(0);
  });

  it("hero off: the rule, the title and the subtitle keep 1/3 · x between them, x on the edges", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, hero: false, divider: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const { x, tops } = stack(box, [RULE_H, T(32), S(9)]);
    expect(ruleYOf(svg)).toBeCloseTo(tops[0], 0);
    expect(linesOf(svg, "title")[0].y - 32 * 0.7).toBeCloseTo(tops[1], 0);
    expect(linesOf(svg, "subtitle")[0].y - 9 * 0.7).toBeCloseTo(tops[2], 0);
    expect(tops[2] + S(9) + x).toBeCloseTo(box.y + box.height, 0);
  });

  it("rule off: hero, title and subtitle keep 1/3 · x between them, x on the edges", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, hero: true, divider: false, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const { x, tops } = stack(box, [HERO_D, T(32), S(9)]);
    expect(heroCyOf(svg)).toBeCloseTo(tops[0] + HERO_D / 2, 0);
    expect(linesOf(svg, "title")[0].y - 32 * 0.7).toBeCloseTo(tops[1], 0);
    expect(linesOf(svg, "subtitle")[0].y - 9 * 0.7).toBeCloseTo(tops[2], 0);
    expect(tops[2] + S(9) + x).toBeCloseTo(box.y + box.height, 0);
  });

  it("texts alone: x on the edges and 1/3 · x between the two ink blocks", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const { x, tops } = stack(box, [T(32), S(9)]);
    expect(linesOf(svg, "title")[0].y - 32 * 0.7).toBeCloseTo(tops[0], 0);
    expect(linesOf(svg, "subtitle")[0].y - 9 * 0.7).toBeCloseTo(tops[1], 0);
    expect(tops[1] + S(9) + x).toBeCloseTo(box.y + box.height, 0);
  });

  it("centres every line's ink on the column's middle line (X)", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, titleWidth: 200, subtitleWidth: 60, titleSize: 32, subtitleSize: 9 });
    const cx = layout.banner!.x + layout.banner!.width / 2;
    for (const line of linesOf(svg, "title")) expect(line.x + line.size * 0.05 + (10 * line.size * 0.5) / 2).toBeCloseTo(cx, 0);
    const subs = linesOf(svg, "subtitle");
    expect(subs.length).toBe(3); // subtitleWidth 60 wraps EDITABLE / STROKE / WIDTH
    const widths = [8, 6, 5];
    subs.forEach((line, i) => expect(line.x + line.size * 0.05 + (widths[i] * line.size * 0.5) / 2).toBeCloseTo(cx, 0));
  });

  it("shrinks both sizes by one factor when the stack cannot hold the minimum edge", () => {
    setTextMeasurer(ink);
    const { layout, svg } = sheet({ edgeSpread: true, hero: true, divider: true, titleWidth: 400, subtitleWidth: 400, titleSize: 120, subtitleSize: 60 },
      { height: 240 });
    const box = layout.banner!;
    const ts = linesOf(svg, "title")[0].size, ss = linesOf(svg, "subtitle")[0].size;
    expect(ts).toBeLessThan(120); // shrunk…
    expect(ss / ts).toBeCloseTo(0.5, 1); // …by one factor
    const { x } = stack(box, [HERO_D, RULE_H, ts * 0.72, ss * 0.72]);
    expect(x).toBeGreaterThanOrEqual(box.height * 0.05 - 0.5); // the Gap % minimum holds
  });

  it("split column: the seam sits in the middle of the title–subtitle gap, the title on its colour", () => {
    setTextMeasurer(ink);
    const { config, layout, svg } = sheet({ style: "split", edgeSpread: true, hero: true, divider: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const box = layout.banner!;
    const { x, tops } = stack(box, [HERO_D, RULE_H, T(32), S(9)]);
    const seam = tops[3] - x / 6; // the middle of the gap between the texts
    const block = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"[^>]*data-split-block/.exec(svg)!;
    expect(Number(block[2]) + Number(block[4])).toBeCloseTo(seam, 0);
    expect(heroCyOf(svg)).toBeCloseTo(tops[0] + HERO_D / 2, 0); // the hero keeps its stack place, on the block
    expect(linesOf(svg, "title")[0].y).toBeLessThan(seam);
    expect(linesOf(svg, "subtitle")[0].y).toBeGreaterThan(seam);
    const fill = /data-banner-text="title"[\s\S]*?<text[^>]*fill="([^"]+)"/.exec(svg)![1].toUpperCase();
    expect(fill).toBe(readableInk(config.banner.accent).toUpperCase());
  });

  it("▦ Guides: the ink blocks and one vertical bar per gap — edges x, neighbours 1/3 · x", () => {
    setTextMeasurer(ink);
    const { config, layout } = sheet({ edgeSpread: true, hero: true, divider: true, titleWidth: 200, subtitleWidth: 200, titleSize: 32, subtitleSize: 9 });
    const boxes = spreadInkBoxes(config, layout)!;
    expect(boxes.gaps).toHaveLength(5); // edge · three neighbours · edge
    for (const g of boxes.gaps) expect(g.height).toBeGreaterThan(g.width); // vertical bars
    const [e0, u0, u1, u2, e1] = boxes.gaps.map((g) => g.height);
    expect(u0).toBeCloseTo(e0 / 3, 0);
    expect(u1).toBeCloseTo(e0 / 3, 0);
    expect(u2).toBeCloseTo(e0 / 3, 0);
    expect(e1).toBeCloseTo(e0, 0);
    const svg = composeSheet({ config, layout, assets: [], placedIds: [], svgTexts: {} }).svg;
    const title = linesOf(svg, "title")[0];
    expect(boxes.title.y).toBeCloseTo(title.y - title.size * 0.7, 0); // exactly the drawn ink
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
