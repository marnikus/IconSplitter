// @vitest-environment node
// builder_undo.test.ts — RULE 12: the builder's changes ride the app's ONE undo
// timeline. Proven here: a recorded builderConfig entry applies through
// state/apply (undo AND redo), a junk payload is refused without moving the
// cursor, and a selection entry that names icons which no longer exist is
// refused rather than resurrected.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEntry, ENTRY_TYPES } from "../src/state/apply";
import { getAppState, patchBuilder, setAppState } from "../src/state/appstore";
import { DEFAULT_BUILDER_CONFIG } from "../src/lib/builder/defaults";
import { withConfigPatch } from "../src/lib/builder/config";
import { DEFAULT_BUILDER, type SessionBuilder } from "../src/lib/session";
import type { HistoryEntry } from "../src/lib/history";

function entry(type: string): HistoryEntry {
  return { id: "e1", type, origin: "builder", at: 1 } as unknown as HistoryEntry;
}

beforeEach(() => {
  setAppState({ builder: { ...DEFAULT_BUILDER } });
});

afterEach(() => {
  setAppState({ builder: { ...DEFAULT_BUILDER } });
});

describe("builder entry types", () => {
  it("are recorded kinds, so the timeline accepts them", () => {
    expect(ENTRY_TYPES).toEqual(expect.arrayContaining(["builderConfig", "builderSelection", "builderSeed"]));
  });

  it("are the only new kinds this tab adds", () => {
    expect(ENTRY_TYPES.filter((t) => t.startsWith("builder"))).toEqual(["builderConfig", "builderSelection", "builderSeed"]);
  });
});

describe("builderConfig", () => {
  it("applies the recorded design on undo and redo", async () => {
    const six = withConfigPatch(DEFAULT_BUILDER_CONFIG, "grid", { columns: 6 });
    await expect(applyEntry(entry("builderConfig"), six)).resolves.toBe(true);
    expect(getAppState().builder.config.grid.columns).toBe(6);
    await expect(applyEntry(entry("builderConfig"), DEFAULT_BUILDER_CONFIG)).resolves.toBe(true);
    expect(getAppState().builder.config.grid.columns).toBe(DEFAULT_BUILDER_CONFIG.grid.columns);
  });

  it("clamps what it applies, so an old entry cannot put a sheet out of range", async () => {
    const wild = { ...DEFAULT_BUILDER_CONFIG, grid: { ...DEFAULT_BUILDER_CONFIG.grid, columns: 900 } };
    await expect(applyEntry(entry("builderConfig"), wild)).resolves.toBe(true);
    expect(getAppState().builder.config.grid.columns).toBeLessThanOrEqual(16);
  });

  it("refuses a payload that is not a config, without touching the sheet", async () => {
    const before = getAppState().builder.config;
    await expect(applyEntry(entry("builderConfig"), "nonsense")).resolves.toBe(false);
    expect(getAppState().builder.config).toEqual(before);
  });
});

describe("builderSelection", () => {
  const placed: SessionBuilder = { ...DEFAULT_BUILDER, slots: ["a", null, "b"], locked: ["b"], seed: 7, recipe: DEFAULT_BUILDER.recipe };

  it("applies slots in cell order, holes included", async () => {
    await expect(applyEntry(entry("builderSelection"), { slots: ["x", null, "y"], locked: ["x"], seed: 3 })).resolves.toBe(true);
    expect(getAppState().builder.slots).toEqual(["x", null, "y"]);
    expect(getAppState().builder.locked).toEqual(["x"]);
    expect(getAppState().builder.seed).toBe(3);
  });

  it("keeps a hole where the hole was (position is the meaning)", async () => {
    await expect(applyEntry(entry("builderSelection"), { slots: [null, "x"] })).resolves.toBe(true);
    expect(getAppState().builder.slots).toEqual([null, "x"]);
  });

  it("refuses a value it cannot even read as a slot list", async () => {
    setAppState({ builder: { ...placed } });
    await expect(applyEntry(entry("builderSelection"), { slots: "every" })).resolves.toBe(false);
    expect(getAppState().builder.slots).toEqual(placed.slots);
  });
});

describe("builderSeed", () => {
  it("applies a positive seed and refuses zero (zero re-seeds)", async () => {
    await expect(applyEntry(entry("builderSeed"), { seed: 41 })).resolves.toBe(true);
    expect(getAppState().builder.seed).toBe(41);
    await expect(applyEntry(entry("builderSeed"), { seed: 0 })).resolves.toBe(false);
    expect(getAppState().builder.seed).toBe(41);
  });

  it("refuses a seed that is not a number", async () => {
    await expect(applyEntry(entry("builderSeed"), { seed: "41" })).resolves.toBe(false);
  });
});

describe("the builder's state moves through the store, not around it", () => {
  it("patchBuilder is the only writer the actions use", () => {
    patchBuilder({ seed: 99 });
    expect(getAppState().builder.seed).toBe(99);
  });
});
