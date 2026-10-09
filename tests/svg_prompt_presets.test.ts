// svg_prompt_presets.test.ts — the Generate SVG prompt window's presets run the
// SAME shared rule through the real reducer (2026-10-09): Save as, Quick load,
// Delete and the pick all land in the model, and the list is its own key, so a
// metadata preset never appears in the SVG drop-down (or the reverse).
import { beforeEach, describe, expect, it } from "vitest";
import { initialModel, reduceState, type SvgModel } from "../src/svg/statemodel";
import { svgPromptActionsOf } from "../src/svg/promptactions";
import { loadConfig } from "../src/svg/promptstore";
import { loadPresets, savePresets } from "../src/svg/promptstore";
import { savePresets as saveUploadPresets } from "../src/upload/promptstore";
import { DEFAULT_PREVIEW_BACKGROUND } from "../src/lib/svgbackground";

const PRESET = { name: "Simpler", text: "Remove one detail." };

function tab(prompt = "Generate an icon."): { get: () => SvgModel; act: ReturnType<typeof svgPromptActionsOf> } {
  let model = initialModel(loadConfig(), prompt, { thumb: 120, providerOpen: true, bg: DEFAULT_PREVIEW_BACKGROUND }, loadPresets());
  const say = () => undefined;
  const dispatch = (a: Parameters<typeof reduceState>[1]) => { model = reduceState(model, a); };
  const act = svgPromptActionsOf(() => ({ m: model, dispatch, say }));
  return { get: () => model, act };
}

beforeEach(() => localStorage.clear());

describe("the Generate SVG prompt presets", () => {
  it("Save as adds a snapshot of the editor and picks it, in the model", () => {
    const t = tab("My SVG prompt");
    t.act.savePresetAs("Mine");
    expect(t.get().presets).toEqual([{ name: "Mine", text: "My SVG prompt" }]);
    expect(t.get().presetPick).toBe("Mine");
    expect(loadPresets()).toEqual([{ name: "Mine", text: "My SVG prompt" }]);
  });

  it("Quick load moves a saved text into the editor", () => {
    savePresets([PRESET]);
    const t = tab();
    t.act.pickPreset("Simpler");
    t.act.quickLoadPreset();
    expect(t.get().prompt).toBe("Remove one detail.");
  });

  it("Delete removes the picked SVG preset and keeps the editor's text", () => {
    savePresets([PRESET]);
    const t = tab("kept text");
    t.act.pickPreset("Simpler");
    t.act.deletePreset();
    expect(t.get().presets).toEqual([]);
    expect(t.get().prompt).toBe("kept text");
  });

  it("the SVG list never shows a metadata preset", () => {
    saveUploadPresets([{ name: "Metadata only", text: "x" }]);
    const t = tab();
    expect(t.get().presets).toEqual([]);
    expect(loadPresets()).toEqual([]);
  });
});
