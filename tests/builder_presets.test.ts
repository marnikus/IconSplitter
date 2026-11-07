// @vitest-environment node
// builder_presets.test.ts — RULE 8 + RULE 13: a preset is the sheet's reproducible
// half (design §4.5). It must round-trip through JSON byte for byte, be validated
// entry by entry when read from disk, and be capped — a store that grows without a
// limit is a slow leak the user cannot see.
import { describe, expect, it } from "vitest";
import {
  applyPreset, BUILDER_PRESET_CAP, parsePresetList, presetFromSheet, presetJson,
  presetOfJson, SHIPPED_PRESETS, presetNameOf,
} from "../src/lib/builder/preset";
import { DEFAULT_BUILDER_CONFIG } from "../src/lib/builder/defaults";
import { DEFAULT_BUILDER } from "../src/lib/session";

const SHEET = {
  config: DEFAULT_BUILDER_CONFIG,
  selection: { ...DEFAULT_BUILDER, slots: ["a", null, "b"], locked: ["b"], seed: 4242 },
};

describe("shipped presets", () => {
  it("offers three, each with a name and a design", () => {
    expect(SHIPPED_PRESETS).toHaveLength(3);
    for (const p of SHIPPED_PRESETS) {
      expect(p.name).not.toBe("");
      expect(p.config.grid.columns).toBeGreaterThan(0);
      expect(p.builtin).toBe(true);
    }
  });

  it("every shipped preset is a valid config in its own right", () => {
    for (const p of SHIPPED_PRESETS) {
      expect(p.config.grid.columns * p.config.grid.rows).toBeGreaterThan(0);
      expect(p.config.artboard.width).toBeGreaterThanOrEqual(256);
    }
  });
});

describe("presetFromSheet — what a preset records", () => {
  it("keeps the design, the seed, the locks and the slots", () => {
    const preset = presetFromSheet("Kitchen", SHEET);
    expect(preset.name).toBe("Kitchen");
    expect(preset.config).toEqual(DEFAULT_BUILDER_CONFIG);
    expect(preset.selection.seed).toBe(4242);
    expect(preset.selection.locked).toEqual(["b"]);
    expect(preset.selection.slots).toEqual(["a", null, "b"]);
  });

  it("does not alias the sheet it was taken from", () => {
    const preset = presetFromSheet("Kitchen", SHEET);
    expect(preset.config).not.toBe(SHEET.config);
    expect(preset.selection.slots).not.toBe(SHEET.selection.slots);
  });

  it("trims and caps the name, and refuses an empty one", () => {
    expect(presetFromSheet("   Kitchen   ", SHEET).name).toBe("Kitchen");
    expect(presetFromSheet("", SHEET).name).toBe("Untitled sheet");
    expect(presetFromSheet("x".repeat(200), SHEET).name).toHaveLength(60);
  });
});

describe("presetOfJson — the file a user can keep", () => {
  it("round-trips: a preset written to JSON reads back equal", () => {
    const preset = presetFromSheet("Kitchen", SHEET);
    const back = presetOfJson(presetJson(preset));
    expect(back).toEqual(preset);
  });

  it("refuses text that is not a preset, instead of guessing one", () => {
    expect(presetOfJson("not json")).toBeNull();
    expect(presetOfJson("{}")).toBeNull();
    expect(presetOfJson(JSON.stringify({ v: 99, preset: {} }))).toBeNull();
  });

  it("a preset from a hostile file is clamped like a stored one", () => {
    const raw = JSON.parse(presetJson(presetFromSheet("K", SHEET)));
    raw.preset.config.grid.columns = 5000;
    raw.preset.selection.seed = -3;
    const back = presetOfJson(JSON.stringify(raw));
    expect(back?.config.grid.columns).toBe(16);
    expect(back?.selection.seed).toBeGreaterThan(0);
  });
});

describe("parsePresetList — the stored list", () => {
  it("keeps the good entries and drops the junk ones", () => {
    const good = presetFromSheet("Kitchen", SHEET);
    const list = parsePresetList({ v: 1, list: [good, { name: 3 }, null, "x"] });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Kitchen");
  });

  it("caps the list at its limit, keeping the newest", () => {
    const many = Array.from({ length: BUILDER_PRESET_CAP + 5 }, (_, i) => presetFromSheet(`p${i}`, SHEET));
    const list = parsePresetList({ v: 1, list: many });
    expect(list).toHaveLength(BUILDER_PRESET_CAP);
    expect(list[list.length - 1].name).toBe(`p${BUILDER_PRESET_CAP + 4}`);
  });

  it("a foreign version is refused wholesale (no half migration)", () => {
    expect(parsePresetList({ v: 2, list: [presetFromSheet("K", SHEET)] })).toEqual([]);
    expect(parsePresetList("nonsense")).toEqual([]);
  });

  it("duplicate names keep the last one", () => {
    const first = presetFromSheet("Same", SHEET);
    const second = { ...presetFromSheet("Same", SHEET), selection: { ...first.selection, seed: 9 } };
    const list = parsePresetList({ v: 1, list: [first, second] });
    expect(list).toHaveLength(1);
    expect(list[0].selection.seed).toBe(9);
  });
});

describe("applyPreset — what the sheet becomes", () => {
  it("returns the preset's design and selection, not a reference to it", () => {
    const preset = SHIPPED_PRESETS[1];
    const applied = applyPreset(preset);
    expect(applied.config).toEqual(preset.config);
    expect(applied.config).not.toBe(preset.config);
  });

  it("a preset never carries a lock the library cannot satisfy", () => {
    const preset = presetFromSheet("K", SHEET);
    const applied = applyPreset(preset, ["a"]); // "b" is gone from the library
    expect(applied.selection.locked).toEqual([]);
    expect(applied.selection.slots).toEqual(["a", null, null]);
  });

  it("keeps a lock the library still has", () => {
    const applied = applyPreset(presetFromSheet("K", SHEET), ["a", "b"]);
    expect(applied.selection.locked).toEqual(["b"]);
  });
});

describe("presetNameOf — the name the UI shows", () => {
  it("never shows an empty title", () => {
    expect(presetNameOf({ ...SHIPPED_PRESETS[0], name: "  " })).toBe("Untitled sheet");
  });
});
