// svg_builder_icon_styles.test.ts — which icon STYLES may be in sheets (2026-11-23).
// An icon's style is the base line stroke, or the style row registered in
// Generate SVG (`<base id>~colored_wiggle`). The style filter is a multi-choice:
// "all", one style, or several; only allowed icons are listed and picked.
import { describe, expect, it } from "vitest";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";
import {
  ALL_STYLES, BASE_STYLE, allowedAssets, isStyledIcon, offStyleIds, parseStyleFilter, styleLabel, styleOfAsset, styleOptions,
} from "../src/lib/svgBuilder/iconstyles";
import { parseBuilderPrefs } from "../src/svgBuilder/prefsstore";

const a = (id: string) => ({ id }) as BuilderIconAsset;
const library = [a("p1"), a("p2~colored_wiggle"), a("p3~flat-duo"), a("p4")];

describe("icon styles in the builder", () => {
  it("reads an icon's style from its id: the base line stroke, or the style after `~`", () => {
    expect([styleOfAsset(a("p1")), styleOfAsset(a("p2~colored_wiggle"))]).toEqual([BASE_STYLE, "colored_wiggle"]);
    expect([isStyledIcon("p2~colored_wiggle"), isStyledIcon("p1"), isStyledIcon("~empty:3")]).toEqual([true, false, false]);
    expect([styleLabel(BASE_STYLE), styleLabel("colored_wiggle"), styleLabel("flat-duo")]).toEqual(["Line stroke", "Colored wiggle", "Flat duo"]);
  });

  it("offers All styles, the base first, then every style the library has — and a picked style the library lost, so it can be unchecked", () => {
    expect(styleOptions(library, ALL_STYLES)).toEqual([[ALL_STYLES, "All styles"], [BASE_STYLE, "Line stroke"], ["colored_wiggle", "Colored wiggle"], ["flat-duo", "Flat duo"]]);
    expect(styleOptions([a("p2~colored_wiggle")], ["gone_style"]).map(([v]) => v)).toEqual([ALL_STYLES, "colored_wiggle", "gone_style"]);
    expect(styleOptions([], ALL_STYLES)).toEqual([[ALL_STYLES, "All styles"]]);
  });

  it("only allowed icons pass; icons on the sheet of unchecked styles are named (empty cells never)", () => {
    expect(allowedAssets(library, ALL_STYLES)).toBe(library);
    expect(allowedAssets(library, BASE_STYLE).map((x) => x.id)).toEqual(["p1", "p4"]);
    expect(allowedAssets(library, ["colored_wiggle", "flat-duo"]).map((x) => x.id)).toEqual(["p2~colored_wiggle", "p3~flat-duo"]);
    expect(offStyleIds(["p1", "~empty:0", "p2~colored_wiggle", "p3~flat-duo"], BASE_STYLE)).toEqual(["p2~colored_wiggle", "p3~flat-duo"]);
    expect(offStyleIds(["p1", "p2~colored_wiggle"], ALL_STYLES)).toEqual([]);
    expect(offStyleIds(["p9~colored_wiggle"], BASE_STYLE)).toEqual(["p9~colored_wiggle"]); // its style says so, listed or not
  });

  it("reads a stored filter field by field: style names only, one value as itself, nothing = all (RULE 13)", () => {
    expect(parseStyleFilter(ALL_STYLES)).toBe(ALL_STYLES);
    expect(parseStyleFilter(BASE_STYLE)).toBe(BASE_STYLE);
    expect(parseStyleFilter([BASE_STYLE, "colored_wiggle", "bad id!", 5, BASE_STYLE])).toEqual([BASE_STYLE, "colored_wiggle"]);
    expect(parseStyleFilter(["colored_wiggle"])).toBe("colored_wiggle");
    expect([parseStyleFilter("../x"), parseStyleFilter([]), parseStyleFilter(null), parseStyleFilter([ALL_STYLES])]).toEqual([ALL_STYLES, ALL_STYLES, ALL_STYLES, ALL_STYLES]);
    expect(parseBuilderPrefs({ styles: [BASE_STYLE] }).styles).toBe(BASE_STYLE);
    expect(parseBuilderPrefs({}).styles).toBe(ALL_STYLES);
  });
});
