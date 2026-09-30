// TDD cycle 4 — presets: every configurable value lives in a preset (spec §3).
import { describe, expect, it } from "vitest";
import {
  applyPreset, defaultPreset, parsePresetList, serializePresetList, validatePreset, type Preset,
} from "../src/lib/presets";

describe("defaultPreset — sane starting values", () => {
  it("carries the spec defaults", () => {
    const p = defaultPreset("My preset");
    expect(p.name).toBe("My preset");
    expect(p.ignoreFolders).toEqual(["_split_output"]);
    expect(p.destMode).toBe("auto"); // <root>/_split_output when no custom dest
    expect(p.split.padding).toBe(6);
    expect(p.split.size).toBe(0); // native
    expect(p.split.transparent).toBe(false);
    expect(p.split.mergeFrac).toBeNull(); // auto merge radius
    expect(p.selection).toBe("remember");
    expect(p.useContentHash).toBe(false);
  });
});

describe("validatePreset — reject unreadable payloads (RULE 13)", () => {
  it("accepts a valid preset unchanged", () => {
    const p = defaultPreset("ok");
    expect(validatePreset(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("returns null for junk and clamps out-of-range numbers", () => {
    expect(validatePreset(null)).toBeNull();
    expect(validatePreset({})).toBeNull();
    expect(validatePreset({ name: 5 })).toBeNull();
    const weird = validatePreset({
      name: "x",
      split: { padding: 999, size: -3, transparent: "yes", mergeFrac: 4 },
      ignoreFolders: "nope",
    });
    expect(weird).not.toBeNull();
    expect(weird!.split.padding).toBeLessThanOrEqual(25);
    expect(weird!.split.size).toBe(0);
    expect(weird!.split.transparent).toBe(false);
    expect(weird!.split.mergeFrac).toBeNull();
    expect(weird!.ignoreFolders).toEqual(["_split_output"]);
  });
});

describe("preset list serialize/parse", () => {
  it("round-trips a named list and drops invalid entries", () => {
    const list = [defaultPreset("a"), defaultPreset("b")];
    const back = parsePresetList(serializePresetList(list));
    expect(back.map((p) => p.name)).toEqual(["a", "b"]);
    expect(parsePresetList("{broken")).toEqual([]);
    expect(parsePresetList('[{"name":12}]')).toEqual([]);
  });
});

describe("applyPreset — last-used preset restores full config (spec §3)", () => {
  it("overrides only provided fields over defaults", () => {
    const p: Preset = { ...defaultPreset("x"), split: { padding: 12, size: 256, transparent: true, mergeFrac: 0.05 } };
    const s = applyPreset(p);
    expect(s.padding).toBe(12);
    expect(s.size).toBe(256);
    expect(s.transparent).toBe(true);
    expect(s.mergeFrac).toBe(0.05);
  });
});
