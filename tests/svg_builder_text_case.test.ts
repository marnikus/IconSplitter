// @vitest-environment happy-dom
// svg_builder_text_case.test.ts — banner title / subtitle case and size (2026-11-15):
// normal, Capitalized or UPPER for each (title normal and subtitle upper by
// default, as before); both sizes go up to 200 px.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { RANGES } from "../src/lib/svgBuilder/ranges";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { applyCase } from "../src/lib/svgBuilder/banner";

function texts(banner: Partial<typeof DEFAULT_CONFIG.banner>): string {
  const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", size: 120, title: "food and DRINK icons", subtitle: "editable stroke width", ...banner } });
  return composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;
}

describe("banner text case and size", () => {
  it("applies normal, Capitalized and UPPER", () => {
    expect(applyCase("food and DRINK icons", "normal")).toBe("food and DRINK icons");
    expect(applyCase("food and DRINK icons", "capitalized")).toBe("Food And Drink Icons");
    expect(applyCase("food and DRINK icons", "upper")).toBe("FOOD AND DRINK ICONS");
  });

  it("defaults keep the old look; each text follows its own case", () => {
    expect(parseSheetConfig({ banner: {} }).banner).toMatchObject({ titleCase: "normal", subtitleCase: "upper" });
    expect(texts({})).toContain(">food and DRINK icons<");
    expect(texts({})).toContain(">EDITABLE STROKE WIDTH<");
    const capped = texts({ titleCase: "capitalized", subtitleCase: "normal" });
    expect(capped).toContain(">Food And Drink Icons<");
    expect(capped).toContain(">editable stroke width<");
    expect(texts({ titleCase: "upper" })).toContain(">FOOD AND DRINK ICONS<");
  });

  it("title and subtitle sizes go up to 200 px", () => {
    expect(RANGES.titleSize.max).toBe(200);
    expect(RANGES.subtitleSize.max).toBe(200);
    expect(parseSheetConfig({ banner: { titleSize: 180, subtitleSize: 999 } }).banner).toMatchObject({ titleSize: 180, subtitleSize: 200 });
  });
});
