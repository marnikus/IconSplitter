// up_settings.test.ts — the export-settings rules execute for real (RULE 8):
// the documented defaults, the clamps every read goes through, the override
// merge (defaults never erase an icon's own choice), and which fields are
// marked overridden. Deleting the module fails every assertion here.
import { describe, expect, it } from "vitest";
import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground } from "../src/lib/svgbackground";
import {
  DEFAULT_EXPORT_SETTINGS, STROKE_REF_DPI, clampExportNumber, effectiveSettings, isOverridden,
  overriddenFields, sanitizeExportSettings, sanitizeOverride, type ExportOverride, type ExportSettings,
} from "../src/lib/upsettings";

describe("upsettings — defaults", () => {
  it("ships the documented default package", () => {
    expect(DEFAULT_EXPORT_SETTINGS).toEqual({
      paddingPct: 8,
      background: DEFAULT_PREVIEW_BACKGROUND,
      strokePt: 2.2,
      jpegMpx: 15.1,
      jpegQuality: 0.92,
      optimizeSvg: true,
      includeEps: false,
      artboard: "square",
    });
  });

  it("documents the pt→px reference DPI (2.2 pt is never unexplained px)", () => {
    expect(STROKE_REF_DPI).toBe(96);
    expect(2.2 * (STROKE_REF_DPI / 72)).toBeCloseTo(2.9333, 3);
  });
});

describe("upsettings — clamping (RULE 13)", () => {
  it("clamps every numeric field into its documented range", () => {
    expect(clampExportNumber("paddingPct", -5)).toBe(0);
    expect(clampExportNumber("paddingPct", 41)).toBe(40);
    expect(clampExportNumber("strokePt", 0)).toBe(0.2);
    expect(clampExportNumber("strokePt", 99)).toBe(8);
    expect(clampExportNumber("jpegMpx", 0)).toBe(1);
    expect(clampExportNumber("jpegMpx", 500)).toBe(30);
    expect(clampExportNumber("jpegQuality", 0.1)).toBe(0.5);
    expect(clampExportNumber("jpegQuality", 1)).toBe(0.98);
  });

  it("refuses NaN and infinity instead of guessing", () => {
    expect(clampExportNumber("paddingPct", Number.NaN)).toBe(DEFAULT_EXPORT_SETTINGS.paddingPct);
    expect(clampExportNumber("strokePt", Number.POSITIVE_INFINITY)).toBe(DEFAULT_EXPORT_SETTINGS.strokePt);
  });

  it("keeps the artboard choice honest: fit survives, garbage is the default", () => {
    const fit = { ...DEFAULT_EXPORT_SETTINGS, artboard: "fit" as const };
    expect(sanitizeExportSettings({ ...fit, paddingPct: 12 })).toEqual({ ...fit, paddingPct: 12 });
    expect(sanitizeExportSettings({ ...fit, artboard: "diagonal" }).artboard).toBe("square");
  });
});

describe("upsettings — sanitize on read", () => {
  it("replaces corrupt payloads with the defaults, field by field (RULE 13)", () => {
    expect(sanitizeExportSettings(null)).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(sanitizeExportSettings("nope")).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(sanitizeExportSettings({ paddingPct: "lots" })).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(sanitizeExportSettings({ strokePt: 4, background: { preset: "green", custom: "#123456" } }))
      .toEqual({ ...DEFAULT_EXPORT_SETTINGS, strokePt: 4, background: { preset: "green", custom: "#123456" } });
  });

  it("keeps a stored background only when it survives its own validator", () => {
    const parsed = sanitizeExportSettings({ background: { preset: "custom", custom: "#a1b2c3" } });
    expect(parsed.background).toEqual(parsePreviewBackground({ preset: "custom", custom: "#a1b2c3" }));
  });
});

describe("upsettings — overrides and effective values", () => {
  it("applies only the fields the icon set; everything else is inherited", () => {
    const eff = effectiveSettings(DEFAULT_EXPORT_SETTINGS, { strokePt: 4, includeEps: true });
    expect(eff.strokePt).toBe(4);
    expect(eff.includeEps).toBe(true);
    expect(eff.paddingPct).toBe(DEFAULT_EXPORT_SETTINGS.paddingPct);
    expect(eff.jpegMpx).toBe(DEFAULT_EXPORT_SETTINGS.jpegMpx);
  });

  it("clamps an override the same way as a default (no second rule)", () => {
    const eff = effectiveSettings(DEFAULT_EXPORT_SETTINGS, { strokePt: 500 });
    expect(eff.strokePt).toBe(8);
  });

  it("no override means the defaults verbatim", () => {
    expect(effectiveSettings(DEFAULT_EXPORT_SETTINGS, null)).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it("a global edit never erases an icon's own override", () => {
    const o: ExportOverride = { strokePt: 4 };
    const newDefaults: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, strokePt: 6 };
    expect(effectiveSettings(newDefaults, o).strokePt).toBe(4);
    expect(effectiveSettings(newDefaults, { paddingPct: 12 }).strokePt).toBe(6);
  });
});

describe("upsettings — the override record itself", () => {
  it("keeps only valid known fields and drops the rest", () => {
    expect(sanitizeOverride({ strokePt: 3, bogus: 1, paddingPct: 20, optimizeSvg: "yes" }))
      .toEqual({ strokePt: 3, paddingPct: 20 });
    expect(sanitizeOverride({ includeEps: true, jpegQuality: 0.8 })).toEqual({ includeEps: true, jpegQuality: 0.8 });
  });

  it("an override with nothing valid in it is no override at all", () => {
    expect(sanitizeOverride(null)).toBeNull();
    expect(sanitizeOverride({})).toBeNull();
    expect(sanitizeOverride({ nope: true })).toBeNull();
  });

  it("names the overridden fields and answers the per-field question", () => {
    const o = sanitizeOverride({ strokePt: 3, includeEps: true });
    expect(o).not.toBeNull();
    expect(overriddenFields(o as ExportOverride)).toEqual(["strokePt", "includeEps"]);
    expect(isOverridden(o as ExportOverride, "strokePt")).toBe(true);
    expect(isOverridden(o as ExportOverride, "paddingPct")).toBe(false);
    expect(isOverridden(null, "strokePt")).toBe(false);
  });
});
