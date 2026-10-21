// upload_badge_settings.test.ts — corner-badge defaults, validation and opt-in fingerprints.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeSettings, overridesEqual, parseOverrides,
  SETTINGS_FIELDS, settingsFingerprint,
} from "../src/lib/upload/settings";

const enabled = () => ({ ...DEFAULT_UPLOAD_SETTINGS, badgeEnabled: true,
  badgeCorner: "bottom-right" as const, badgeWidthPct: 40, badgeOffsetXPct: 3, badgeOffsetYPct: 3 });

describe("artboard corner-badge settings", () => {
  it("starts off, keeps the historic fingerprint, and preserves byte-for-byte as-is when off", () => {
    expect(DEFAULT_UPLOAD_SETTINGS).toMatchObject({ badgeEnabled: false, badgeCorner: "bottom-right",
      badgeWidthPct: 40, badgeOffsetXPct: 3, badgeOffsetYPct: 3 });
    expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe("36232c04");
    expect(settingsFingerprint({ ...enabled(), badgeEnabled: false, badgeCorner: "top-left", badgeWidthPct: 99,
      badgeOffsetXPct: 45, badgeOffsetYPct: 23 })).toBe("36232c04");
    expect(isAsIs({ ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS })).toBe(true);
    expect(isAsIs({ ...enabled(), ...AS_IS_SETTINGS })).toBe(false);
  });

  it("keeps badge opt-in per icon, clamps values, and rejects bad stored fields independently", () => {
    expect(normalizeSettings({ badgeEnabled: true, badgeCorner: "top-left", badgeWidthPct: 0,
      badgeOffsetXPct: -4, badgeOffsetYPct: 123 })).toMatchObject({
      badgeEnabled: false, badgeCorner: "top-left", badgeWidthPct: 1, badgeOffsetXPct: 0, badgeOffsetYPct: 100,
    });
    expect(normalizeSettings({ badgeCorner: "middle", badgeWidthPct: "bad", badgeOffsetXPct: Infinity }))
      .toMatchObject({ badgeEnabled: false, badgeCorner: "bottom-right", badgeWidthPct: 40, badgeOffsetXPct: 3 });
    expect(parseOverrides({ badgeEnabled: true, badgeCorner: "bottom-left", badgeWidthPct: 200,
      badgeOffsetXPct: 25, badgeOffsetYPct: 100 })).toEqual({
      badgeEnabled: true, badgeCorner: "bottom-left", badgeWidthPct: 100, badgeOffsetXPct: 25, badgeOffsetYPct: 100,
    });
    expect(parseOverrides({ badgeEnabled: "yes", badgeCorner: "middle", badgeWidthPct: "45",
      badgeOffsetXPct: NaN, badgeOffsetYPct: null })).toEqual({});
  });

  it("includes every badge pin in undo equality", () => {
    for (const field of ["badgeEnabled", "badgeCorner", "badgeWidthPct", "badgeOffsetXPct", "badgeOffsetYPct"]) {
      expect(SETTINGS_FIELDS).toContain(field);
    }
    expect(overridesEqual({ badgeCorner: "top-left" }, { badgeCorner: "bottom-right" })).toBe(false);
    expect(overridesEqual({ badgeOffsetXPct: 3 }, { badgeOffsetXPct: 4 })).toBe(false);
  });

  it("fingerprints enabled-only corner, full percentages and template content", () => {
    const base = enabled();
    const fingerprint = settingsFingerprint(base);
    expect(fingerprint).not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    for (const changed of [
      { badgeCorner: "top-right" as const }, { badgeWidthPct: 40.0004 },
      { badgeOffsetXPct: 3.0004 }, { badgeOffsetYPct: 3.0004 },
    ]) expect(settingsFingerprint({ ...base, ...changed })).not.toBe(fingerprint);
  });
});
