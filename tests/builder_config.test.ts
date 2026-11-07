// @vitest-environment node
// builder_config.test.ts — RULE 8 + RULE 13: the sheet design is read from storage
// written by an older (or a hostile) version, so every field is clamped on its own.
// One junk field must cost that FIELD only — never the sheet, never a throw — and a
// value that is out of range must come back as the nearest usable one, not silently
// as the default (a user who typed 300 columns should see the maximum, not 4).
import { describe, expect, it } from "vitest";
import {
  defaultConfigOf, parseBuilderConfig, serializeBuilderConfig, withConfigPatch,
  CONFIG_LIMITS, configFingerprint,
} from "../src/lib/builder/config";
import { DEFAULT_BUILDER_CONFIG } from "../src/lib/builder/defaults";
import { computeLayout } from "../src/lib/builder/layout";

describe("parseBuilderConfig — every field stands on its own", () => {
  it("gives the verified default for nothing at all", () => {
    expect(parseBuilderConfig(null)).toEqual(DEFAULT_BUILDER_CONFIG);
    expect(defaultConfigOf()).toEqual(DEFAULT_BUILDER_CONFIG);
  });

  it("clamps an out-of-range number to the range, not to the default", () => {
    const c = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, grid: { ...DEFAULT_BUILDER_CONFIG.grid, columns: 300 } });
    expect(c.grid.columns).toBe(CONFIG_LIMITS.columns.max);
    const tiny = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, icons: { ...DEFAULT_BUILDER_CONFIG.icons, box: 1 } });
    expect(tiny.icons.box).toBe(CONFIG_LIMITS.box.min);
  });

  it("one junk field costs that field only", () => {
    const c = parseBuilderConfig({
      ...DEFAULT_BUILDER_CONFIG,
      artboard: { ...DEFAULT_BUILDER_CONFIG.artboard, width: "wide", padding: 88 },
    });
    expect(c.artboard.width).toBe(DEFAULT_BUILDER_CONFIG.artboard.width);
    expect(c.artboard.padding).toBe(88); // the neighbour survived
  });

  it("refuses a colour it cannot draw with, keeping the field's own default", () => {
    const c = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, artboard: { ...DEFAULT_BUILDER_CONFIG.artboard, background: "not-a-colour" } });
    expect(c.artboard.background).toBe(DEFAULT_BUILDER_CONFIG.artboard.background);
  });

  it("ignores an unknown enum member instead of guessing one", () => {
    const c = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, banner: { ...DEFAULT_BUILDER_CONFIG.banner, position: "diagonal" } });
    expect(c.banner.position).toBe(DEFAULT_BUILDER_CONFIG.banner.position);
  });

  it("never lets a banner be wider than the artboard, on either axis", () => {
    const c = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, banner: { ...DEFAULT_BUILDER_CONFIG.banner, position: "left", size: 9999 } });
    expect(c.banner.size).toBeLessThanOrEqual(Math.max(c.artboard.width, c.artboard.height));
  });

  it("a parsed config always fits the layout engine (no NaN, no negative)", () => {
    const c = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, grid: { ...DEFAULT_BUILDER_CONFIG.grid, gapX: -50, gapY: 1e9 } });
    const layout = computeLayout(c);
    expect(Number.isFinite(layout.fitScale)).toBe(true);
    expect(layout.cells).toHaveLength(c.grid.columns * c.grid.rows);
    expect(c.grid.gapX).toBe(CONFIG_LIMITS.gap.min);
    expect(c.grid.gapY).toBe(CONFIG_LIMITS.gap.max);
  });
});

describe("serializeBuilderConfig — the stored shape is the read shape", () => {
  it("round-trips a parsed config byte for byte", () => {
    const once = parseBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, grid: { ...DEFAULT_BUILDER_CONFIG.grid, columns: 6 } });
    const text = serializeBuilderConfig(once);
    expect(parseBuilderConfig(JSON.parse(text))).toEqual(once);
    expect(serializeBuilderConfig(parseBuilderConfig(JSON.parse(text)))).toBe(text);
  });

  it("carries its version, so a future reader can tell", () => {
    expect(JSON.parse(serializeBuilderConfig(DEFAULT_BUILDER_CONFIG))).toMatchObject({ v: 1 });
  });
});

describe("withConfigPatch — one control, one change", () => {
  it("patches only the section named, leaving the rest alone", () => {
    const next = withConfigPatch(DEFAULT_BUILDER_CONFIG, "grid", { columns: 6 });
    expect(next.grid.columns).toBe(6);
    expect(next.grid.rows).toBe(DEFAULT_BUILDER_CONFIG.grid.rows);
    expect(next.icons).toEqual(DEFAULT_BUILDER_CONFIG.icons);
  });

  it("clamps the patch as strictly as a stored read", () => {
    expect(withConfigPatch(DEFAULT_BUILDER_CONFIG, "grid", { columns: 999 }).grid.columns).toBe(CONFIG_LIMITS.columns.max);
    expect(withConfigPatch(DEFAULT_BUILDER_CONFIG, "icons", { box: -2 }).icons.box).toBe(CONFIG_LIMITS.box.min);
  });
});

describe("configFingerprint — what the sheet IS, not how it is displayed", () => {
  it("is stable for the same config", () => {
    expect(configFingerprint(DEFAULT_BUILDER_CONFIG)).toBe(configFingerprint(parseBuilderConfig(DEFAULT_BUILDER_CONFIG)));
  });

  it("changes when a described field changes", () => {
    const moved = withConfigPatch(DEFAULT_BUILDER_CONFIG, "grid", { columns: 5 });
    expect(configFingerprint(moved)).not.toBe(configFingerprint(DEFAULT_BUILDER_CONFIG));
  });

  it("ignores the export-only fields (they do not change the sheet)", () => {
    const a = { ...DEFAULT_BUILDER_CONFIG, export: { pngScale: 1 as const, background: "sheet" as const } };
    const b = { ...DEFAULT_BUILDER_CONFIG, export: { pngScale: 3 as const, background: "transparent" as const } };
    expect(configFingerprint(a)).toBe(configFingerprint(b));
  });
});
