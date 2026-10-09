// prompt_presets_shared.test.ts — the ONE save/load/delete rule the metadata
// prompt and the generation prompt share (2026-10-09). The actions are pure
// over a getter and an io, so the rule is tested without a DOM; the store is the
// real one over localStorage (RULE 8). Each key keeps its own list (RULE 13).
import { beforeEach, describe, expect, it } from "vitest";
import { presetActionsOf, type PresetEvent, type PresetIo, type PresetModel } from "../src/ui/presetops";
import { presetStore } from "../src/state/presetstore";
import type { PromptPreset } from "../src/lib/promptpresets";

const KEY_A = "iconSplitter.test.presets.a";
const KEY_B = "iconSplitter.test.presets.b";
const SAVED: PromptPreset[] = [{ name: "Bolder", text: "Make strokes bolder." }];

function rig(model: Partial<PresetModel> = {}) {
  const store = presetStore(KEY_A);
  const events: PresetEvent[] = [];
  const says: Array<[string, boolean | undefined]> = [];
  const m: PresetModel = { prompt: "Editor text", presets: SAVED, presetPick: "", ...model };
  const io: PresetIo = {
    store,
    dispatch: (e) => events.push(e),
    say: (msg, err) => says.push([msg, err]),
  };
  return { actions: presetActionsOf(() => ({ m, io })), events, says, store };
}

beforeEach(() => localStorage.clear());

describe("presetStore — one versioned list per key", () => {
  it("round-trips a list and keeps the two keys apart", () => {
    presetStore(KEY_A).save(SAVED);
    expect(presetStore(KEY_A).load()).toEqual(SAVED);
    expect(presetStore(KEY_B).load()).toEqual([]);
  });

  it("a corrupt payload costs one ignored load, never a throw", () => {
    localStorage.setItem(KEY_A, "{not json");
    expect(presetStore(KEY_A).load()).toEqual([]);
  });
});

describe("presetActionsOf — the shared gestures", () => {
  it("pick records the chosen name only", () => {
    const { actions, events } = rig();
    actions.pickPreset("Bolder");
    expect(events).toEqual([{ type: "preset-pick", name: "Bolder" }]);
  });

  it("Quick load refuses with nothing picked", () => {
    const { actions, events, says } = rig();
    actions.quickLoadPreset();
    expect(events).toEqual([]);
    expect(says[0]?.[1]).toBe(true);
  });

  it("Quick load puts the picked preset text into the editor", () => {
    const { actions, events } = rig({ presetPick: "Bolder" });
    actions.quickLoadPreset();
    expect(events).toEqual([{ type: "prompt", prompt: "Make strokes bolder." }]);
  });

  it("Save as refuses a blank name and writes nothing", () => {
    const { actions, events, store, says } = rig();
    actions.savePresetAs("   ");
    expect(events).toEqual([]);
    expect(store.load()).toEqual([]);
    expect(says[0]?.[1]).toBe(true);
  });

  it("Save as stores a snapshot of the editor, first in the list, and picks it", () => {
    const { actions, events, store } = rig();
    actions.savePresetAs("Strict");
    expect(store.load()).toEqual([{ name: "Strict", text: "Editor text" }, ...SAVED]);
    expect(events).toEqual([
      { type: "presets", presets: [{ name: "Strict", text: "Editor text" }, ...SAVED] },
      { type: "preset-pick", name: "Strict" },
    ]);
  });

  it("Delete refuses with nothing picked", () => {
    const { actions, events, store } = rig();
    store.save(SAVED);
    actions.deletePreset();
    expect(events).toEqual([]);
    expect(store.load()).toEqual(SAVED);
  });

  it("Delete removes the picked preset and keeps the editor's text", () => {
    const { actions, events, store } = rig({ presetPick: "Bolder" });
    store.save(SAVED);
    actions.deletePreset();
    expect(store.load()).toEqual([]);
    expect(events).toEqual([
      { type: "presets", presets: [] },
      { type: "preset-pick", name: "" },
    ]);
    expect(events.some((e) => e.type === "prompt")).toBe(false);
  });
});

describe("the same rule over the two lists", () => {
  it("a save lands in its own key and never in the other list", () => {
    const { actions } = rig();
    actions.savePresetAs("Only here");
    expect(presetStore(KEY_A).load().map((p) => p.name)).toContain("Only here");
    expect(presetStore(KEY_B).load()).toEqual([]);
  });
});
