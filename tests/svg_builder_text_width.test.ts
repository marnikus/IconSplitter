// @vitest-environment happy-dom
// svg_builder_text_width.test.ts — the banner title / subtitle box width (2026-11-14):
// 0 = automatic (the old character limits); a width set by the user wraps the
// text at that many pixels instead.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { RANGES } from "../src/lib/svgBuilder/ranges";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";

const LONG = "why it so long text used here";
function titleLines(banner: Partial<typeof DEFAULT_CONFIG.banner>): number {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", size: 120, title: LONG, ...banner } });
  const svg = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
  const block = /data-banner-text="title"[\s\S]*?<\/g>/.exec(svg)?.[0] ?? "";
  return (block.match(/<text/g) ?? []).length;
}

describe("banner text width", () => {
  it("is 0 (automatic) on older configs and clamps to its range", () => {
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ titleWidth: 0, subtitleWidth: 0 });
    expect(parseSheetConfig({ banner: { titleWidth: 99999 } }).banner.titleWidth).toBe(RANGES.textWidth.max);
  });

  it("automatic keeps the old wrap; a wider box keeps a long title on one line; a narrow one wraps more", () => {
    expect(titleLines({})).toBe(2); // the old 25-character limit
    expect(titleLines({ titleWidth: 1000 })).toBe(1);
    expect(titleLines({ titleWidth: 120 })).toBe(3);
  });
});
