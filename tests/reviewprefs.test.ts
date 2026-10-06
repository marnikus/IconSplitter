// reviewprefs.test.ts — RULE 13: persisted view prefs (mode + thumbnail zoom)
// validate on read, clamp to the slider range and never throw (spec V2 §4).
// The RANGE itself belongs to lib/zoom (I-55) and is tested there; these tests
// pin the stored payload: an out-of-range height is clamped, an unknown mode is
// dropped, and a corrupt payload costs one ignored load.
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "../src/lib/reviewprefs";
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from "../src/lib/zoom";

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
    expect(parsePrefs('{"mode":"nope","thumbHeight":9999}')).toEqual({ mode: "list", thumbHeight: ZOOM_MAX });
    expect(parsePrefs('{"thumbHeight":1}')).toEqual({ mode: "list", thumbHeight: ZOOM_MIN });
  });

  it("falls back to the defaults for a missing or unusable height", () => {
    expect(parsePrefs('{"thumbHeight":"huge"}')).toEqual({ mode: "list", thumbHeight: ZOOM_DEFAULT });
    expect(parsePrefs("{}")).toEqual(DEFAULT_PREFS);
  });

  it("round-trips through serialize", () => {
    const prefs = { mode: "compare" as const, thumbHeight: 800 };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
  });
});
