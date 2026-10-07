// RULE 8 — the settings domain rules run for real: defaults, clamps, the
// global/local override merge, reset semantics and the fingerprint that
// selective re-export keys on.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_SETTINGS,
  clampMegapixels,
  clampPaddingPct,
  clampQuality,
  clampStrokePt,
  effectiveSettings,
  normalizeSettings,
  overrideKeys,
  parseOverrides,
  settingsEqual,
  settingsFingerprint,
  type UploadSettings,
} from "../src/lib/upload/settings";

const changed = (patch: Partial<UploadSettings>): UploadSettings => ({ ...DEFAULT_UPLOAD_SETTINGS, ...patch });

describe("defaults and clamps", () => {
  it("ships the documented defaults (8% padding, white, no stroke override, 15.1 MP, quality 0.92, optimize on, EPS off)", () => {
    expect(DEFAULT_UPLOAD_SETTINGS).toEqual({
      paddingPct: 8, background: "#ffffff", strokePt: 0,
      jpegMegapixels: 15.1, jpegQuality: 0.92, optimizeSvg: true, includeEps: false,
    });
  });

  it("clamps every numeric field into its range; nonsense falls back to the default", () => {
    expect(clampPaddingPct(-5)).toBe(0);
    expect(clampPaddingPct(99)).toBe(50);
    expect(clampPaddingPct("nonsense")).toBe(8);
    expect(clampStrokePt(2.2)).toBeCloseTo(2.2);
    expect(clampStrokePt(99)).toBe(24);
    expect(clampMegapixels(0)).toBe(1);
    expect(clampMegapixels(15.1)).toBeCloseTo(15.1);
    expect(clampMegapixels(1000)).toBe(64);
    expect(clampQuality(0.1)).toBe(0.5);
    expect(clampQuality(2)).toBe(1);
    expect(clampQuality(0.92)).toBeCloseTo(0.92);
  });

  it("normalizeSettings repairs a corrupt stored payload field by field", () => {
    const fixed = normalizeSettings({
      paddingPct: 500, background: "not-a-color", strokePt: -1,
      jpegMegapixels: "lots", jpegQuality: 9, optimizeSvg: "yes", includeEps: 1,
    });
    // booleans: only an explicit true/false counts — a nonsensical value falls
    // back to the documented default (optimize on, EPS off)
    expect(fixed).toEqual({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 50, strokePt: 0, jpegQuality: 1 });
  });

  it("normalizeSettings on a non-record returns the defaults wholesale (RULE 13)", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_UPLOAD_SETTINGS);
    expect(normalizeSettings("junk")).toEqual(DEFAULT_UPLOAD_SETTINGS);
  });
});

describe("global defaults + per-icon overrides", () => {
  it("effective settings inherit every default when no override exists", () => {
    expect(effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {})).toEqual(DEFAULT_UPLOAD_SETTINGS);
  });

  it("an override affects only its own field", () => {
    const eff = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { background: "#102030", strokePt: 2.2 });
    expect(eff.background).toBe("#102030");
    expect(eff.strokePt).toBeCloseTo(2.2);
    expect(eff.paddingPct).toBe(8); // inherited, not erased
    expect(eff.optimizeSvg).toBe(true);
  });

  it("overrides are validated on read; a corrupt override is dropped, not fatal", () => {
    expect(parseOverrides({ paddingPct: 500, background: "junk", includeEps: true })).toEqual({ paddingPct: 50, includeEps: true });
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides({ paddingPct: "x" })).toEqual({});
  });

  it("reset to defaults is an empty override — the global base stays", () => {
    const eff = effectiveSettings(changed({ paddingPct: 20 }), {});
    expect(eff.paddingPct).toBe(20);
    expect(overrideKeys({})).toEqual([]);
    expect(overrideKeys({ strokePt: 1 })).toEqual(["strokePt"]);
  });
});

describe("fingerprint and equality", () => {
  it("is stable for equal settings and moves when any field moves", () => {
    const a = settingsFingerprint(DEFAULT_UPLOAD_SETTINGS);
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS })).toBe(a);
    expect(settingsFingerprint(changed({ paddingPct: 9 }))).not.toBe(a);
    expect(settingsFingerprint(changed({ includeEps: true }))).not.toBe(a);
  });

  it("settingsEqual compares by value, not identity", () => {
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, { ...DEFAULT_UPLOAD_SETTINGS })).toBe(true);
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, changed({ jpegQuality: 0.9 }))).toBe(false);
  });
});
