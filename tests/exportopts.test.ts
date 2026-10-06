// exportopts.test.ts — RULE 13: the Sheets export settings come back from a
// restart clamped and valid, and "Native (auto)" (size 0) stays a real choice.
import { describe, expect, it } from "vitest";
import { DEFAULT_SHEET_OPTS, parseSheetOpts, PADDING_MAX, SIZES } from "../src/lib/exportopts";

describe("parseSheetOpts", () => {
  it("defaults when there is nothing to read", () => {
    expect(parseSheetOpts(null)).toEqual(DEFAULT_SHEET_OPTS);
    expect(parseSheetOpts("wide")).toEqual(DEFAULT_SHEET_OPTS);
    expect(parseSheetOpts([])).toEqual(DEFAULT_SHEET_OPTS);
  });

  it("restores a valid set untouched", () => {
    expect(parseSheetOpts({ padding: 12, size: 1024, transparent: true }))
      .toEqual({ padding: 12, size: 1024, transparent: true });
  });

  it("clamps padding into the slider range", () => {
    expect(parseSheetOpts({ padding: 999, size: 512, transparent: false }).padding).toBe(PADDING_MAX);
    expect(parseSheetOpts({ padding: -4, size: 512, transparent: false }).padding).toBe(0);
    expect(parseSheetOpts({ padding: 7.4, size: 512, transparent: false }).padding).toBe(7);
    expect(parseSheetOpts({ padding: "wide", size: 512, transparent: false }).padding).toBe(DEFAULT_SHEET_OPTS.padding);
  });

  it("accepts only a size the <select> can show", () => {
    expect(parseSheetOpts({ padding: 6, size: 0, transparent: false }).size).toBe(0); // Native (auto)
    expect(parseSheetOpts({ padding: 6, size: 700, transparent: false }).size).toBe(DEFAULT_SHEET_OPTS.size);
    expect(parseSheetOpts({ padding: 6, size: "512", transparent: false }).size).toBe(DEFAULT_SHEET_OPTS.size);
  });

  it("treats only a real boolean as transparent", () => {
    expect(parseSheetOpts({ padding: 6, size: 512, transparent: "yes" }).transparent).toBe(false);
    expect(parseSheetOpts({ padding: 6, size: 512, transparent: true }).transparent).toBe(true);
  });

  it("offers every listed size and a native option", () => {
    expect(SIZES[0].v).toBe(0);
    expect(SIZES.map((s) => s.v)).toEqual([0, 128, 256, 512, 1024, 2048]);
    expect(SIZES.every((s) => s.l.length > 0)).toBe(true);
  });
});
