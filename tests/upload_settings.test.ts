import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeHex, PADDING_MAX, parseUploadSettings,
  settingIssues, settingsSummary, type UploadSettings,
} from "../src/lib/uploadsettings";
import { formatStroke, parseStroke, pxToMm, unitToPx, pxToUnit } from "../src/lib/uploadunits";
import {
  applyToSelected, clearOverride, effectiveSettings, inheritance, isOverridden,
  overriddenFields, parseOverrideMap, resetSelected, restoreOverrides, withOverride,
} from "../src/lib/uploadoverride";

const defaults = DEFAULT_UPLOAD_SETTINGS;

describe("upload settings", () => {
  it("starts from the defaults the brief names", () => {
    expect(defaults.paddingPct).toBe(10);
    expect(defaults.iconScalePct).toBe(100);
    expect(defaults.background).toBe("#ffffff");
    expect(defaults.strokeWidth).toBe(2.2);
    expect(defaults.strokeUnit).toBe("pt");
    expect(defaults.targetMP).toBe(15.1);
    expect(defaults.optimizeSvg).toBe(true);
    expect(defaults.includeEps).toBe(false);
    expect(defaults.dpi).toBe(300);
    expect(defaults.square).toBe(true);
    expect(defaults.backgroundInSvg).toBe(false);
  });

  it("clamps a stored payload instead of trusting it", () => {
    const parsed = parseUploadSettings({ paddingPct: 900, iconScalePct: -5, targetMP: 0, jpegQuality: 9, dpi: 1 });
    expect(parsed.paddingPct).toBe(PADDING_MAX);
    expect(parsed.iconScalePct).toBe(10);
    expect(parsed.targetMP).toBe(0.1);
    expect(parsed.jpegQuality).toBe(1);
    expect(parsed.dpi).toBe(72);
  });

  it("falls back to the defaults for a payload that is not an object", () => {
    expect(parseUploadSettings("nonsense")).toEqual(defaults);
    expect(parseUploadSettings(null)).toEqual(defaults);
  });

  it("keeps only known units and profiles", () => {
    const parsed = parseUploadSettings({ strokeUnit: "furlong", colorProfile: "cmyk" });
    expect(parsed.strokeUnit).toBe("pt");
    expect(parsed.colorProfile).toBe("srgb");
  });

  it("normalises hex colours and refuses names", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#112233")).toBe("#112233");
    expect(normalizeHex("white")).toBeNull();
    expect(parseUploadSettings({ background: "white" }).background).toBe("#ffffff");
  });

  it("reports one issue per bad field", () => {
    const bad: UploadSettings = { ...defaults, paddingPct: 50, jpegQuality: 0.1, dpi: 20, background: "red" };
    const fields = settingIssues(bad).map((issue) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(["paddingPct", "jpegQuality", "dpi", "background"]));
    expect(settingIssues(defaults)).toEqual([]);
  });

  it("clamps a typed value, and the panel validates the draft before it is stored", () => {
    expect(parseUploadSettings({ paddingPct: 900 }).paddingPct).toBe(PADDING_MAX);
    expect(settingIssues({ ...defaults, paddingPct: 900 }).map((i) => i.field)).toEqual(["paddingPct"]);
    expect(parseUploadSettings({ paddingPct: 5 }).paddingPct).toBe(5);
  });

  it("summarises the values the row shows", () => {
    expect(settingsSummary(defaults)).toBe("2.2 pt · 10% pad · 15.1 MP · q92");
  });
});

describe("units", () => {
  it("converts 2.2 pt at 300 DPI to pixels", () => {
    expect(unitToPx(2.2, "pt", 300)).toBeCloseTo(9.1667, 3);
    expect(pxToUnit(9.1667, "pt", 300)).toBeCloseTo(2.2, 3);
  });

  it("converts mm and inches at the same DPI", () => {
    expect(unitToPx(25.4, "mm", 300)).toBeCloseTo(300, 6);
    expect(unitToPx(1, "in", 300)).toBeCloseTo(300, 6);
    expect(unitToPx(9, "px", 300)).toBe(9);
  });

  it("parses the stroke field the way a person types it", () => {
    expect(parseStroke("2.2 pt")).toEqual({ value: 2.2, unit: "pt" });
    expect(parseStroke("2,2pt")).toEqual({ value: 2.2, unit: "pt" });
    expect(parseStroke("3")).toEqual({ value: 3, unit: "px" });
    expect(parseStroke("")).toBeNull();
    expect(parseStroke("-2 pt")).toBeNull();
    expect(parseStroke("thick")).toBeNull();
  });

  it("formats one way everywhere", () => {
    expect(formatStroke(2.2, "pt")).toBe("2.2 pt");
    expect(pxToMm(300, 300)).toBeCloseTo(25.4, 6);
  });
});

describe("per-icon overrides", () => {
  it("applies only the fields the override actually sets", () => {
    const effective = effectiveSettings(defaults, { paddingPct: 25 });
    expect(effective.paddingPct).toBe(25);
    expect(effective.targetMP).toBe(15.1);
    expect(effective.strokeWidth).toBe(2.2);
  });

  it("survives a later change to the globals", () => {
    const before = effectiveSettings(defaults, { paddingPct: 25 });
    const after = effectiveSettings({ ...defaults, targetMP: 4, paddingPct: 5 }, { paddingPct: 25 });
    expect(after.paddingPct).toBe(25);
    expect(after.targetMP).toBe(4);
    expect(before.targetMP).toBe(15.1);
  });

  it("never re-parses an untouched default (0.01 MP stayed 0.01)", () => {
    const tight: UploadSettings = { ...defaults, targetMP: 0.01 };
    const effective = effectiveSettings(tight, {});
    expect(effective.targetMP).toBeCloseTo(0.01, 6);
  });

  it("lists overridden fields and answers per field", () => {
    expect(overriddenFields({ paddingPct: 20, square: false })).toEqual(["paddingPct", "square"]);
    expect(isOverridden({ paddingPct: 20 }, "paddingPct")).toBe(true);
    expect(isOverridden({ paddingPct: 20 }, "targetMP")).toBe(false);
    expect(overriddenFields(undefined)).toEqual([]);
  });

  it("drops a field when the patch clears it", () => {
    const map = withOverride({ a: { paddingPct: 25 } }, "a", { paddingPct: undefined });
    expect(map.a).toBeUndefined();
  });

  it("does not store a value that equals the default", () => {
    const map = withOverride({}, "a", { paddingPct: defaults.paddingPct });
    expect(map.a).toBeUndefined();
  });

  it("removes an icon's own settings on reset", () => {
    const map = clearOverride({ a: { paddingPct: 25 }, b: { dpi: 600 } }, "a");
    expect(map.a).toBeUndefined();
    expect(map.b).toEqual({ dpi: 600 });
  });

  it("applies one change to a selection and reports what changed", () => {
    const result = applyToSelected({ a: { paddingPct: 5 } }, ["a", "b", "c"], { paddingPct: 30 });
    expect(result.changed).toBe(3);
    expect(result.map.a?.paddingPct).toBe(30);
    expect(result.map.c?.paddingPct).toBe(30);
    expect(result.before).toEqual({ a: { paddingPct: 5 } });
    expect(result.after.a).toEqual({ paddingPct: 30 });
  });

  it("counts only the icons a reset really touched", () => {
    const result = resetSelected({ a: { paddingPct: 5 } }, ["a", "b"]);
    expect(result.changed).toBe(1);
    expect(result.map.a).toBeUndefined();
  });

  it("restores a saved selection state for undo", () => {
    const after = { a: { paddingPct: 30 }, b: { paddingPct: 30 } };
    const back = restoreOverrides(after, ["a", "b"], { a: { paddingPct: 5 } });
    expect(back.a?.paddingPct).toBe(5);
    expect(back.b).toBeUndefined();
  });

  it("re-derives a stored override map instead of trusting it", () => {
    const parsed = parseOverrideMap({ a: { paddingPct: 900, junk: 1 }, b: "no", "": { dpi: 300 }, c: null });
    expect(parsed.a).toEqual({ paddingPct: PADDING_MAX });
    expect(parsed.b).toBeUndefined();
    expect(parsed.c).toBeUndefined();
    expect(parsed[""]).toBeUndefined();
  });

  it("marks each setting as inherited or overridden", () => {
    const lines = inheritance({ a: { paddingPct: 25 } }, "a", defaults);
    const padding = lines.find((line) => line.field === "paddingPct");
    const target = lines.find((line) => line.field === "targetMP");
    expect(padding?.source).toBe("overridden");
    expect(target?.source).toBe("inherited");
  });
});
