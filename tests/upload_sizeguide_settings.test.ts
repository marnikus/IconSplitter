// upload_sizeguide_settings.test.ts — S/L size-guide defaults, validation and opt-in fingerprints.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeSettings, overridesEqual, parseOverrides,
  SETTINGS_FIELDS, settingsFingerprint, SIZE_GUIDE_STROKE_MAX,
} from "../src/lib/upload/settings";

const enabled = () => ({
  ...DEFAULT_UPLOAD_SETTINGS, sizeGuideEnabled: true, sizeGuideCorner: "bottom-left" as const,
  sizeGuideSmallPct: 6, sizeGuideLargePct: 12, sizeGuideSmallStrokePx: 0, sizeGuideLargeStrokePx: 0,
  sizeGuideGapPct: 2, sizeGuideOffsetXPct: 3, sizeGuideOffsetYPct: 3,
});

const GUIDE_FIELDS = [
  "sizeGuideEnabled", "sizeGuideCorner", "sizeGuideSmallPct", "sizeGuideLargePct",
  "sizeGuideSmallStrokePx", "sizeGuideLargeStrokePx", "sizeGuideGapPct",
  "sizeGuideOffsetXPct", "sizeGuideOffsetYPct",
] as const;

describe("S/L size-guide settings", () => {
  it("starts off bottom-left with stroke widths in px (0–50) and keeps the historic fingerprint while off", () => {
    expect(SIZE_GUIDE_STROKE_MAX).toBe(50);
    expect(DEFAULT_UPLOAD_SETTINGS).toMatchObject({
      sizeGuideEnabled: false, sizeGuideCorner: "bottom-left", sizeGuideSmallPct: 6, sizeGuideLargePct: 12,
      sizeGuideSmallStrokePx: 0, sizeGuideLargeStrokePx: 0, sizeGuideGapPct: 2,
      sizeGuideOffsetXPct: 3, sizeGuideOffsetYPct: 3,
    });
    expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe("36232c04");
    expect(settingsFingerprint({
      ...enabled(), sizeGuideEnabled: false, sizeGuideCorner: "top-right", sizeGuideSmallPct: 90,
      sizeGuideLargePct: 95, sizeGuideGapPct: 40,
    })).toBe("36232c04");
    expect(isAsIs({ ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS })).toBe(true);
    expect(isAsIs({ ...enabled(), ...AS_IS_SETTINGS })).toBe(false);
  });

  it("keeps the guide opt-in per icon, clamps strokes to 0–50 px and migrates stored *StrokePct numbers", () => {
    expect(normalizeSettings({ sizeGuideEnabled: true, sizeGuideCorner: "top-right", sizeGuideSmallPct: 0,
      sizeGuideLargePct: 400, sizeGuideSmallStrokePx: -2, sizeGuideLargeStrokePx: 99,
      sizeGuideGapPct: 130, sizeGuideOffsetXPct: -4, sizeGuideOffsetYPct: 123 })).toMatchObject({
      sizeGuideEnabled: false, sizeGuideCorner: "top-right", sizeGuideSmallPct: 1, sizeGuideLargePct: 100,
      sizeGuideSmallStrokePx: 0, sizeGuideLargeStrokePx: 50, sizeGuideGapPct: 100,
      sizeGuideOffsetXPct: 0, sizeGuideOffsetYPct: 100,
    });
    expect(normalizeSettings({ sizeGuideSmallStrokePx: 32 }).sizeGuideSmallStrokePx).toBe(32);
    const migrated = normalizeSettings({ sizeGuideSmallStrokePct: 2, sizeGuideLargeStrokePct: 3.5 });
    expect(migrated).toMatchObject({ sizeGuideSmallStrokePx: 2, sizeGuideLargeStrokePx: 3.5 });
    expect(Object.keys(migrated)).not.toContain("sizeGuideSmallStrokePct");
    expect(normalizeSettings({ sizeGuideSmallStrokePx: 4, sizeGuideSmallStrokePct: 2 }).sizeGuideSmallStrokePx).toBe(4);
    expect(parseOverrides({ sizeGuideSmallStrokePct: 1.5, sizeGuideLargeStrokePct: 2.5 }))
      .toEqual({ sizeGuideSmallStrokePx: 1.5, sizeGuideLargeStrokePx: 2.5 });
    expect(normalizeSettings({ sizeGuideCorner: "middle", sizeGuideSmallPct: "bad", sizeGuideOffsetXPct: Infinity }))
      .toMatchObject({ sizeGuideEnabled: false, sizeGuideCorner: "bottom-left", sizeGuideSmallPct: 6, sizeGuideOffsetXPct: 3 });
    expect(parseOverrides({ sizeGuideEnabled: true, sizeGuideCorner: "bottom-right", sizeGuideSmallPct: 9,
      sizeGuideLargePct: 18, sizeGuideSmallStrokePx: 1.5, sizeGuideLargeStrokePx: 2.5, sizeGuideGapPct: 4,
      sizeGuideOffsetXPct: 5, sizeGuideOffsetYPct: 6 })).toEqual({
      sizeGuideEnabled: true, sizeGuideCorner: "bottom-right", sizeGuideSmallPct: 9,
      sizeGuideLargePct: 18, sizeGuideSmallStrokePx: 1.5, sizeGuideLargeStrokePx: 2.5,
      sizeGuideGapPct: 4, sizeGuideOffsetXPct: 5, sizeGuideOffsetYPct: 6,
    });
    expect(parseOverrides({ sizeGuideEnabled: "yes", sizeGuideCorner: "middle", sizeGuideSmallPct: "9",
      sizeGuideGapPct: NaN, sizeGuideOffsetYPct: null })).toEqual({});
  });

  it("includes every guide pin in undo equality", () => {
    for (const field of GUIDE_FIELDS) {
      expect(SETTINGS_FIELDS).toContain(field);
    }
    expect(overridesEqual({ sizeGuideCorner: "top-left" }, { sizeGuideCorner: "bottom-left" })).toBe(false);
    expect(overridesEqual({ sizeGuideSmallStrokePx: 1.5 }, { sizeGuideSmallStrokePx: 2.5 })).toBe(false);
    expect(overridesEqual({ sizeGuideGapPct: 2 }, { sizeGuideGapPct: 2 })).toBe(true);
  });

  it("fingerprints every enabled field and both supplied letter templates", () => {
    const base = enabled();
    const fingerprint = settingsFingerprint(base);
    expect(fingerprint).not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    for (const changed of [
      { sizeGuideCorner: "top-left" as const }, { sizeGuideSmallPct: 7 }, { sizeGuideLargePct: 13 },
      { sizeGuideSmallStrokePx: 1.5 }, { sizeGuideLargeStrokePx: 2.5 }, { sizeGuideGapPct: 3 },
      { sizeGuideOffsetXPct: 4 }, { sizeGuideOffsetYPct: 5 },
    ]) expect(settingsFingerprint({ ...base, ...changed })).not.toBe(fingerprint);
  });
});
