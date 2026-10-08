// RULE 8 — the settings domain rules run for real: defaults, clamps, the
// global/local override merge, reset semantics and the fingerprint that
// selective re-export keys on.
import { describe, expect, it } from "vitest";
import {
  ARTBOARD_PRESETS,
  CONTENT_ARTBOARD,
  DEFAULT_UPLOAD_SETTINGS,
  artboardSize,
  clampArtboard,
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
  it("ships the documented defaults (8% padding, white, no stroke override, 15.1 MP, quality 0.92, optimize on, EPS off, content-hugging artboard, JPEG follows the artboard)", () => {
    expect(DEFAULT_UPLOAD_SETTINGS).toEqual({
      paddingPct: 8, background: "#ffffff", strokePt: 0,
      jpegMegapixels: 15.1, jpegQuality: 0.92, optimizeSvg: true, includeEps: false,
      artboard: { mode: "content", size: 512, width: 512, height: 512 },
      jpegMatchArtboard: true,
    });
  });

  it("offers the popular square artboards plus an exact custom size", () => {
    expect(ARTBOARD_PRESETS).toEqual([256, 512, 1024, 2048, 4096]);
    expect(artboardSize({ mode: "content", size: 512, width: 1, height: 1 })).toBeNull();
    expect(artboardSize({ mode: "preset", size: 1024, width: 1, height: 1 })).toEqual({ width: 1024, height: 1024 });
    expect(artboardSize({ mode: "custom", size: 512, width: 512, height: 256 })).toEqual({ width: 512, height: 256 });
  });

  it("clamps a custom artboard: edges, then the 64 MP pixel ceiling, keeping the aspect", () => {
    expect(clampArtboard({ mode: "custom", size: 512, width: 5, height: 5 })).toMatchObject({ width: 16, height: 16 });
    expect(clampArtboard({ mode: "custom", size: 512, width: 99999, height: 8 })).toMatchObject({ width: 8192, height: 16 });
    const huge = clampArtboard({ mode: "custom", size: 512, width: 8192, height: 8192 });
    expect(huge.width * huge.height).toBeLessThanOrEqual(64_000_000);
    expect(huge.width / huge.height).toBeCloseTo(1, 2);
    expect(clampArtboard("nonsense")).toEqual(CONTENT_ARTBOARD);
    expect(clampArtboard({ mode: "weird", size: 512, width: 512, height: 512 })).toEqual(CONTENT_ARTBOARD);
    // a preset rounds to the nearest offered size, so a stored oddity still lands somewhere sane
    expect(clampArtboard({ mode: "preset", size: 1000, width: 1, height: 1 })).toMatchObject({ mode: "preset", size: 1024 });
  });

  it("keeps the JPEG resolution the user's own decision, artboard or not", () => {
    // Default: when the artboard pins a px size, that size IS the JPEG — but the
    // user can say otherwise, and that decision is a stored setting like any other.
    expect(DEFAULT_UPLOAD_SETTINGS.jpegMatchArtboard).toBe(true);
    expect(parseOverrides({ jpegMatchArtboard: false })).toEqual({ jpegMatchArtboard: false });
    expect(parseOverrides({ jpegMatchArtboard: true })).toEqual({ jpegMatchArtboard: true });
    expect(parseOverrides({ jpegMatchArtboard: "no" })).toEqual({}); // only a real boolean survives
    expect(parseOverrides({ jpegMatchArtboard: 0 })).toEqual({});

    // a corrupt or missing stored value falls back to the default
    expect(normalizeSettings({ jpegMatchArtboard: "junk" } as unknown as Record<string, unknown>).jpegMatchArtboard).toBe(true);
    expect(normalizeSettings({} as Record<string, unknown>).jpegMatchArtboard).toBe(true);
    expect(normalizeSettings({ jpegMatchArtboard: false }).jpegMatchArtboard).toBe(false);

    // it changes the output, so it must move the fingerprint and the equality check
    const off: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, jpegMatchArtboard: false };
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, off)).toBe(false);
    expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).not.toBe(settingsFingerprint(off));
  });

  it("rounds a custom size to whole pixels and falls back where a number is missing", () => {
    expect(clampArtboard({ mode: "custom", size: 512, width: 300.4, height: 200.6 }))
      .toMatchObject({ width: 300, height: 201 });
    // an unreadable value never becomes 0×0: it lands on the documented default edge
    expect(clampArtboard({ mode: "custom", size: 512, width: "wide", height: Number.NaN }))
      .toMatchObject({ width: 512, height: 512 });
    // and a preset rounds DOWN as readily as up
    expect(clampArtboard({ mode: "preset", size: 700, width: 1, height: 1 })).toMatchObject({ size: 512 });
    expect(clampArtboard({ mode: "preset", size: Number.NaN, width: 1, height: 1 })).toMatchObject({ size: 512 });
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

  it("round-trips an artboard through normalize / parseOverrides / fingerprint", () => {
    const stored = normalizeSettings({ ...DEFAULT_UPLOAD_SETTINGS, artboard: { mode: "custom", width: 512, height: 256 } });
    expect(stored.artboard).toEqual({ mode: "custom", size: 512, width: 512, height: 256 });
    expect(parseOverrides({ artboard: { mode: "preset", size: 2048 } })).toEqual({
      artboard: { mode: "preset", size: 2048, width: 512, height: 512 },
    });
    expect(parseOverrides({ artboard: "big" })).toEqual({});
    const pinned = changed({ artboard: { mode: "preset", size: 512, width: 512, height: 512 } });
    expect(settingsFingerprint(pinned)).not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    expect(settingsEqual(pinned, changed({ artboard: { ...pinned.artboard } }))).toBe(true);
    expect(settingsEqual(pinned, DEFAULT_UPLOAD_SETTINGS)).toBe(false);
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
