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
  clampStrokePx,
  STROKE_MAX,
  effectiveSettings,
  normalizeSettings,
  overrideKeys,
  parseOverrides,
  SETTINGS_FIELDS,
  STROKE_COLOR_ARTWORK,
  STROKE_COLOR_DEFAULT,
  TRANSPARENT,
  flattenColor,
  isTransparent,
  settingsEqual,
  settingsFingerprint,
  type UploadSettings,
} from "../src/lib/upload/settings";

const changed = (patch: Partial<UploadSettings>): UploadSettings => ({ ...DEFAULT_UPLOAD_SETTINGS, ...patch });

describe("defaults and clamps", () => {
  it("ships the documented defaults (8% padding, transparent, no stroke override, the artwork's stroke colour, 15.1 MP, quality 0.92, optimize on, EPS off, content-hugging artboard, JPEG follows the artboard)", () => {
    expect(DEFAULT_UPLOAD_SETTINGS).toEqual({
      paddingPct: 8, background: "transparent", strokePx: 0, strokeColor: "#000000",
      jpegMegapixels: 15.1, jpegQuality: 0.92, optimizeSvg: true, includeEps: false,
      epsConverter: "builtin",
      artboard: { mode: "content", size: 512, width: 512, height: 512 },
      jpegMatchArtboard: true,
    });
  });

  it("background: transparent or a colour; a format without alpha flattens transparent onto white (2026-10-08)", () => {
    expect(TRANSPARENT).toBe("transparent");
    expect(isTransparent("transparent")).toBe(true);
    expect(isTransparent("#ffffff")).toBe(false);
    expect(flattenColor("transparent")).toBe("#ffffff");
    expect(flattenColor("#102030")).toBe("#102030");
    expect(normalizeSettings({ background: "transparent" }).background).toBe("transparent");
    expect(normalizeSettings({ background: "#ABC" }).background).toBe("#aabbcc");
    expect(normalizeSettings({ background: "none" }).background).toBe("transparent"); // junk → the default
    expect(parseOverrides({ background: "transparent" })).toEqual({ background: "transparent" });
    expect(parseOverrides({ background: "garbage" })).toEqual({});
    // a user who stored white before this change keeps white
    expect(normalizeSettings({ background: "#ffffff" }).background).toBe("#ffffff");
  });

  it("stroke colour: the artwork's own, or one hex every visible stroke gets (2026-10-08)", () => {
    expect(STROKE_COLOR_ARTWORK).toBe("artwork");
    expect(normalizeSettings({ strokeColor: "#000" }).strokeColor).toBe("#000000");
    expect(normalizeSettings({ strokeColor: "artwork" }).strokeColor).toBe("artwork");
    expect(normalizeSettings({ strokeColor: 42 }).strokeColor).toBe("#000000"); // the stock default (2026-10-08), not the artwork's mix
    expect(normalizeSettings({}).strokeColor).toBe("#000000");
    expect(STROKE_COLOR_DEFAULT).toBe("#000000");
    expect(parseOverrides({ strokeColor: "#111111" })).toEqual({ strokeColor: "#111111" });
    expect(parseOverrides({ strokeColor: "artwork" })).toEqual({ strokeColor: "artwork" });
    expect(parseOverrides({ strokeColor: "red" })).toEqual({});
    expect(SETTINGS_FIELDS).toContain("strokeColor");
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, changed({ strokeColor: "artwork" }))).toBe(false);
    expect(settingsFingerprint(changed({ strokeColor: "artwork" }))).not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    expect(settingsFingerprint(changed({ background: "#ffffff" }))).not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
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
    expect(clampStrokePx(2.2)).toBeCloseTo(2.2);
    expect(clampStrokePx(99)).toBe(32);
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
      paddingPct: 500, background: "not-a-color", strokePx: -1, strokeColor: ["#000"],
      jpegMegapixels: "lots", jpegQuality: 9, optimizeSvg: "yes", includeEps: 1,
    });
    // booleans: only an explicit true/false counts — a nonsensical value falls
    // back to the documented default (optimize on, EPS off)
    expect(fixed).toEqual({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 50, strokePx: 0, jpegQuality: 1 });
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
    const eff = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { background: "#102030", strokePx: 2.2 });
    expect(eff.background).toBe("#102030");
    expect(eff.strokePx).toBeCloseTo(2.2);
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
    expect(overrideKeys({ strokePx: 1 })).toEqual(["strokePx"]);
  });

  it("strokePx is px in the file's own units, 0–32; a stored strokePt (pre-2026-10-08) carries its NUMBER over (the user meant px)", () => {
    expect(STROKE_MAX).toBe(32);
    expect(normalizeSettings({ strokePt: 2 }).strokePx).toBe(2);
    expect(normalizeSettings({ strokePx: 3, strokePt: 2 }).strokePx).toBe(3); // the new key wins
    expect(normalizeSettings({ strokePx: 40 }).strokePx).toBe(32);
    expect(parseOverrides({ strokePt: 2.5 })).toEqual({ strokePx: 2.5 });
    expect(parseOverrides({ strokePx: 1, strokePt: 2.5 })).toEqual({ strokePx: 1 });
    expect(Object.keys(normalizeSettings({ strokePt: 2 }))).not.toContain("strokePt"); // read as an alias, never written
    // the same number under the new name is the same fingerprint: no export flips to stale by the rename
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2 })).toBe(settingsFingerprint(normalizeSettings({ strokePt: 2 })));
  });
});

describe("fingerprint and equality", () => {
  it("is stable for equal settings and moves when any field moves", () => {
    const a = settingsFingerprint(DEFAULT_UPLOAD_SETTINGS);
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS })).toBe(a);
    expect(settingsFingerprint(changed({ paddingPct: 9 }))).not.toBe(a);
    expect(settingsFingerprint(changed({ includeEps: true }))).not.toBe(a);
    expect(settingsFingerprint(changed({ epsConverter: "inkscape" }))).not.toBe(a);
  });

  it("epsConverter defaults to builtin; junk normalizes; overrides pin a valid id", () => {
    expect(DEFAULT_UPLOAD_SETTINGS.epsConverter).toBe("builtin");
    expect(SETTINGS_FIELDS).toContain("epsConverter");
    expect(normalizeSettings({ epsConverter: "inkscape" }).epsConverter).toBe("inkscape");
    expect(normalizeSettings({ epsConverter: "ghostscript" }).epsConverter).toBe("builtin");
    expect(parseOverrides({ epsConverter: "inkscape" })).toEqual({ epsConverter: "inkscape" });
    expect(parseOverrides({ epsConverter: "ghostscript" })).toEqual({});
  });

  it("settingsEqual compares by value, not identity", () => {
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, { ...DEFAULT_UPLOAD_SETTINGS })).toBe(true);
    expect(settingsEqual(DEFAULT_UPLOAD_SETTINGS, changed({ jpegQuality: 0.9 }))).toBe(false);
  });
});
