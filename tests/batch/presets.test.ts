// RULE 8 + RULE 13 — presets run for real against localStorage; corrupt
// payloads are rejected. Deleting validation fails here.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultPreset,
  listPresetNames,
  normalizeExtensions,
  presetFrom,
  readLastName,
  readPreset,
  removePreset,
  sanitizePreset,
  settingsOf,
  writeLastName,
  writePreset,
  type BatchPreset,
} from "../../src/batch/presets";

const NOW = "2026-10-01T07:00:00.000Z";
const good = (): BatchPreset => defaultPreset("work", NOW);

beforeEach(() => {
  localStorage.removeItem("iconsplitter.presets.v1");
  localStorage.removeItem("iconsplitter.preset.last.v1");
});
afterEach(() => {
  localStorage.removeItem("iconsplitter.presets.v1");
  localStorage.removeItem("iconsplitter.preset.last.v1");
});

describe("defaultPreset", () => {
  it("covers every configurable value with sane defaults", () => {
    const p = good();
    expect(p.name).toBe("work");
    expect(p.scan).toEqual({ includeExtensions: ["png", "jpg", "jpeg", "webp"], ignoreOutputDir: true, useContentHash: false });
    expect(p.split).toEqual({ padding: 6, size: 512, transparent: false, mergeFrac: null });
    expect(p.naming.outputDirName).toBe("_split_output");
    expect(p.selection).toEqual({ autoSelectNew: true, keepMissingInList: true });
    expect(p.duplicates).toEqual({ neverOverwrite: true, variationPrefix: "_v" });
  });
});

describe("sanitizePreset — corrupt in, null out (RULE 13)", () => {
  it("accepts a valid preset unchanged", () => {
    expect(sanitizePreset(JSON.parse(JSON.stringify(good())))).toEqual(good());
  });

  it("rejects bad meta and bad sections", () => {
    expect(sanitizePreset(null)).toBeNull();
    expect(sanitizePreset({ ...good(), version: 2 })).toBeNull();
    expect(sanitizePreset({ ...good(), name: "  " })).toBeNull();
    expect(sanitizePreset({ ...good(), updatedAt: "yesterday" })).toBeNull();
    expect(sanitizePreset({ ...good(), split: { ...good().split, padding: 99 } })).toBeNull();
    expect(sanitizePreset({ ...good(), split: { ...good().split, size: 123 } })).toBeNull();
    expect(sanitizePreset({ ...good(), split: { ...good().split, mergeFrac: 9 } })).toBeNull();
    expect(sanitizePreset({ ...good(), scan: { ...good().scan, includeExtensions: [] } })).toBeNull();
    expect(sanitizePreset({ ...good(), scan: { ...good().scan, includeExtensions: ["PN G"] } })).toBeNull();
    expect(sanitizePreset({ ...good(), naming: { ...good().naming, outputDirName: "a/b" } })).toBeNull();
    expect(sanitizePreset({ ...good(), duplicates: { ...good().duplicates, variationPrefix: "" } })).toBeNull();
    expect(sanitizePreset({ ...good(), duplicates: { ...good().duplicates, neverOverwrite: false } })).toBeNull();
  });
});

describe("normalizeExtensions", () => {
  it("splits, lowercases, strips dots, dedupes, drops junk", () => {
    expect(normalizeExtensions("PNG, .jpg  webp")).toEqual(["png", "jpg", "webp"]);
    expect(normalizeExtensions("png,png,!!!")).toEqual(["png"]);
    expect(normalizeExtensions("")).toEqual([]);
  });
});

describe("settingsOf / presetFrom", () => {
  it("round-trips settings with folder meta", () => {
    const s = settingsOf(good());
    const p = presetFrom("n", { sourceName: "S", destName: "D", useCustomDest: true }, s, NOW);
    expect(p.name).toBe("n");
    expect(settingsOf(p)).toEqual(s);
  });
});

describe("preset storage", () => {
  it("writes, lists (sorted), reads and deletes", () => {
    expect(writePreset(good())).toBe(true);
    expect(writePreset({ ...good(), name: "aaa" })).toBe(true);
    expect(listPresetNames()).toEqual(["aaa", "work"]);
    expect(readPreset("work")).toEqual(good());
    expect(removePreset("work")).toBe(true);
    expect(listPresetNames()).toEqual(["aaa"]);
    expect(readPreset("work")).toBeNull();
  });

  it("skips corrupt entries instead of crashing", () => {
    localStorage.setItem("iconsplitter.presets.v1", JSON.stringify({ ok: good(), bad: { version: 99 } }));
    expect(listPresetNames()).toEqual(["ok"]);
    expect(readPreset("bad")).toBeNull();
  });

  it("remembers the last-used preset and forgets it on delete", () => {
    expect(readLastName()).toBeNull();
    expect(writeLastName("work")).toBe(true);
    expect(readLastName()).toBe("work");
    writePreset(good());
    expect(readLastName()).toBe("work");
    removePreset("work");
    expect(readLastName()).toBeNull();
  });
});
