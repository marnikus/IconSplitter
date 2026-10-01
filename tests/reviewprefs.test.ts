// reviewprefs.test.ts — RULE 13: persisted view prefs (mode + thumbnail zoom)
// validate on read, clamp to the slider range and never throw (spec V2 §4).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS, THUMB_DEFAULT, THUMB_MAX, THUMB_MIN, THUMB_STEP,
  clampThumb, parsePrefs, serializePrefs, thumbHeight, thumbLabel,
} from "../src/lib/reviewprefs";

describe("clampThumb — slider range 48–240 px", () => {
  it("exposes the documented bounds and step", () => {
    expect([THUMB_MIN, THUMB_MAX, THUMB_STEP, THUMB_DEFAULT]).toEqual([48, 240, 4, 84]);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampThumb(1)).toBe(THUMB_MIN);
    expect(clampThumb(-50)).toBe(THUMB_MIN);
    expect(clampThumb(10_000)).toBe(THUMB_MAX);
  });

  it("snaps to the slider step so the value always matches the input", () => {
    expect(clampThumb(85)).toBe(84);
    expect(clampThumb(86)).toBe(88);
    expect(clampThumb(128)).toBe(128);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampThumb(Number.NaN)).toBe(THUMB_DEFAULT);
    expect(clampThumb(Number.POSITIVE_INFINITY)).toBe(THUMB_DEFAULT);
  });
});

describe("thumbHeight — never upscale past the source pixels", () => {
  it("uses the slider value while the natural size is unknown", () => {
    expect(thumbHeight(128, 0)).toBe(128);
  });

  it("keeps a large image at the slider value", () => {
    expect(thumbHeight(128, 512)).toBe(128);
  });

  it("shrinks below the slider value for a smaller source", () => {
    expect(thumbHeight(128, 64)).toBe(64);
  });
});

describe("thumbLabel", () => {
  it("renders the px readout shown next to the slider", () => {
    expect(thumbLabel(128)).toBe("128 px");
    expect(thumbLabel(THUMB_MIN)).toBe("48 px");
  });
});

describe("parsePrefs / serializePrefs", () => {
  it("defaults when nothing is stored yet", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
  });

  it("rejects a corrupt payload instead of throwing (RULE 13)", () => {
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1,2,3]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("null")).toEqual(DEFAULT_PREFS);
  });

  it("accepts a stored mode and thumb height", () => {
    expect(parsePrefs('{"mode":"compare","thumbHeight":120}')).toEqual({ mode: "compare", thumbHeight: 120 });
  });

  it("clamps an out-of-range stored height and drops an unknown mode", () => {
    expect(parsePrefs('{"mode":"nope","thumbHeight":9999}')).toEqual({ mode: "list", thumbHeight: THUMB_MAX });
    expect(parsePrefs('{"thumbHeight":"huge"}')).toEqual({ mode: "list", thumbHeight: THUMB_DEFAULT });
  });

  it("round-trips through serialize", () => {
    const prefs = { mode: "compare" as const, thumbHeight: 160 };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
  });
});
