// reviewprefs.test.ts — RULE 13: persisted view prefs (mode + thumbnail zoom)
// validate on read, clamp to the slider range and never throw (spec V2 §4).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS, THUMB_DEFAULT, THUMB_MAX, THUMB_MIN, THUMB_STEP,
  clampThumb, parsePrefs, serializePrefs, thumbBox, thumbHeight, thumbLabel, vectorThumbBox,
} from "../src/lib/reviewprefs";

describe("clampThumb — slider range 48–800 px, ONE range for both tabs", () => {
  it("exposes the documented bounds and step", () => {
    expect([THUMB_MIN, THUMB_MAX, THUMB_STEP, THUMB_DEFAULT]).toEqual([48, 800, 4, 84]);
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

  it("really reaches 800, the height the fix asks for", () => {
    expect(clampThumb(800)).toBe(800);
    expect(clampThumb(240)).toBe(240); // the old maximum is a value, not a cap
    expect(clampThumb(796)).toBe(796);
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

describe("thumbBox — the box a thumbnail occupies, never stretched", () => {
  it("falls back to a square while the natural size is not known yet", () => {
    expect(thumbBox(800, { width: 0, height: 0 })).toEqual({ width: 800, height: 800 });
  });

  it("follows the source's own aspect ratio", () => {
    expect(thumbBox(400, { width: 4000, height: 3000 })).toEqual({ width: 533, height: 400 });
    expect(thumbBox(800, { width: 3200, height: 1200 })).toEqual({ width: 2133, height: 800 });
  });

  it("keeps the height at the slider value and never upscales past the source", () => {
    expect(thumbBox(800, { width: 3200, height: 2400 })).toEqual({ width: 1067, height: 800 });
    expect(thumbBox(800, { width: 1024, height: 512 })).toEqual({ width: 1024, height: 512 });
    expect(thumbBox(800, { width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
  });
});

describe("vectorThumbBox — an SVG scales to full height by its viewBox ratio", () => {
  it("uses the box ratio and no natural-size cap (a vector has no pixels)", () => {
    expect(vectorThumbBox(800, 1)).toEqual({ width: 800, height: 800 });
    expect(vectorThumbBox(800, 2)).toEqual({ width: 1600, height: 800 });
    expect(vectorThumbBox(400, 0.5)).toEqual({ width: 200, height: 400 });
    expect(vectorThumbBox(48, 24 / 24)).toEqual({ width: 48, height: 48 });
  });

  it("falls back to a square for an unusable ratio", () => {
    expect(vectorThumbBox(128, 0)).toEqual({ width: 128, height: 128 });
    expect(vectorThumbBox(128, Number.NaN)).toEqual({ width: 128, height: 128 });
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
