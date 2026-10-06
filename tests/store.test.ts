// TDD cycle 8 — store: presets in localStorage (spec §3), validated on read.
import { beforeEach, describe, expect, it } from "vitest";
import { loadLastName, loadPresets, saveLastName, savePresets } from "../src/batch/store";
import { defaultPreset } from "../src/lib/presets";

beforeEach(() => localStorage.clear());

describe("preset persistence", () => {
  it("round-trips a preset list", () => {
    savePresets([defaultPreset("a"), defaultPreset("b")]);
    expect(loadPresets().map((p) => p.name)).toEqual(["a", "b"]);
  });
  it("empty storage yields an empty list; corrupt storage is rejected (RULE 13)", () => {
    expect(loadPresets()).toEqual([]);
    localStorage.setItem("iconSplitter.presets.v1", "{oops");
    expect(loadPresets()).toEqual([]);
  });
});

describe("last-used preset (spec §3: automatically remember)", () => {
  it("stores and reads the last preset name", () => {
    expect(loadLastName()).toBeNull();
    saveLastName("My preset");
    expect(loadLastName()).toBe("My preset");
  });
});
