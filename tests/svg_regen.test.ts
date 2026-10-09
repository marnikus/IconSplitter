// svg_regen.test.ts — the "Regenerate SVG from" setting (2026-10-09): parsing
// and clamping (RULE 13), the plan a run gets from it (a missing saved prompt
// is a named refusal, never a silent fallback), one icon per request in the
// current-SVG mode, the exact text that carries the SVG code, and the stored
// setting read back. Each test fails if the mode is ignored, the preset is
// guessed, or the request size stops being one.
import { beforeEach, describe, expect, it } from "vitest";
import {
  currentSvgPrompt, DEFAULT_REGEN, parseRegen, regenLabelOf, regenPlanOf, requestSizeFor, serializeRegen,
  type RegenSetting,
} from "../src/lib/svgregen";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { loadRegenSetting, resolveRegen, saveRegenSetting } from "../src/svg/regenstore";
import { guard, perRequestOf } from "../src/svg/runplan";
import type { SvgCtx } from "../src/svg/actions";
import { FakeDir } from "./helpers/fakefs";
import { savePresets } from "../src/upload/promptstore";
import { PRESET_NAME_MAX, type PromptPreset } from "../src/lib/upload/promptpresets";

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make the strokes bolder and keep the layout." },
  { name: "Blank", text: "   " },
];

describe("parseRegen — junk costs one default, never a crash (RULE 13)", () => {
  it("falls back to the main prompt for anything foreign", () => {
    expect(parseRegen(null)).toEqual(DEFAULT_REGEN);
    expect(parseRegen({ v: 2, mode: "current-svg", presetName: "Bolder" })).toEqual(DEFAULT_REGEN);
    expect(parseRegen("current-svg")).toEqual(DEFAULT_REGEN);
  });

  it("keeps a valid mode and name, and maps an unknown mode to the main prompt", () => {
    expect(parseRegen({ v: 1, mode: "current-svg", presetName: " Bolder " })).toEqual({ mode: "current-svg", presetName: "Bolder" });
    expect(parseRegen({ v: 1, mode: "contact-sheet", presetName: "Bolder" })).toEqual({ mode: "main", presetName: "Bolder" });
  });

  it("drops a name that is not a usable preset name", () => {
    expect(parseRegen({ v: 1, mode: "current-svg", presetName: "x".repeat(PRESET_NAME_MAX + 1) })).toEqual({ mode: "current-svg", presetName: "" });
    expect(parseRegen({ v: 1, mode: "current-svg", presetName: 7 })).toEqual({ mode: "current-svg", presetName: "" });
  });

  it("round-trips through serialize", () => {
    const setting: RegenSetting = { mode: "current-svg", presetName: "Bolder" };
    expect(parseRegen(JSON.parse(serializeRegen(setting)))).toEqual(setting);
  });
});

describe("regenPlanOf — the plan a run is given", () => {
  it("the main mode ignores the presets entirely", () => {
    expect(regenPlanOf(DEFAULT_REGEN, [])).toEqual({ ok: true, plan: { kind: "main" } });
  });

  it("refuses the current-SVG mode with no saved prompt picked, and says where to pick one", () => {
    const out = regenPlanOf({ mode: "current-svg", presetName: "" }, PRESETS);
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.problem).toContain("Export settings");
  });

  it("refuses a picked preset that no longer exists, naming it", () => {
    const out = regenPlanOf({ mode: "current-svg", presetName: "Gone" }, PRESETS);
    expect(out.ok ? "" : out.problem).toContain("“Gone”");
  });

  it("refuses a picked preset whose text is blank — it would send nothing useful", () => {
    const out = regenPlanOf({ mode: "current-svg", presetName: "Blank" }, PRESETS);
    expect(out.ok).toBe(false);
  });

  it("hands over the picked preset's name and text", () => {
    expect(regenPlanOf({ mode: "current-svg", presetName: "Bolder" }, PRESETS)).toEqual({
      ok: true,
      plan: { kind: "current-svg", presetName: "Bolder", presetText: "Make the strokes bolder and keep the layout." },
    });
  });
});

describe("requestSizeFor — one icon per request in the current-SVG mode", () => {
  it("keeps the configured size in the main mode", () => {
    expect(requestSizeFor(4, { kind: "main" })).toBe(4);
    expect(requestSizeFor(DEFAULT_CONFIG.imagesPerRequest, { kind: "main" })).toBe(DEFAULT_CONFIG.imagesPerRequest);
  });

  it("is 1 in the current-SVG mode whatever the configured size says", () => {
    const plan = { kind: "current-svg" as const, presetName: "Bolder", presetText: "x" };
    expect(requestSizeFor(9, plan)).toBe(1);
    expect(requestSizeFor(1, plan)).toBe(1);
  });
});

describe("currentSvgPrompt — the saved prompt, the icon's name, then the code", () => {
  const code = "<svg viewBox=\"0 0 24 24\"><path d=\"M2 2h20\"/></svg>";

  it("carries the trimmed prompt, the name line and the SVG code verbatim, in that order", () => {
    const text = currentSvgPrompt("  Make it bolder.  ", "icon-1_AI", code);
    const at = (s: string) => text.indexOf(s);
    expect(text.startsWith("Make it bolder.")).toBe(true);
    expect(at("Icon name (use it as the SVG <title>): icon-1_AI")).toBeGreaterThan(at("Make it bolder."));
    expect(at(code)).toBeGreaterThan(at("Icon name (use it as the SVG <title>): icon-1_AI"));
    expect(text.endsWith(code)).toBe(true);
  });
});

describe("regenLabelOf — what the log and the user are told", () => {
  it("names the main mode and the picked saved prompt", () => {
    expect(regenLabelOf({ kind: "main" })).toBe("main prompt + first image");
    expect(regenLabelOf({ kind: "current-svg", presetName: "Bolder", presetText: "x" })).toContain("“Bolder”");
  });
});

describe("regenstore — the setting is stored and read back (RULE 13)", () => {
  beforeEach(() => {
    localStorage.clear();
    savePresets(PRESETS);
  });

  it("starts in the main mode when nothing is stored", () => {
    expect(loadRegenSetting()).toEqual(DEFAULT_REGEN);
  });

  it("reads back what was saved", () => {
    saveRegenSetting({ mode: "current-svg", presetName: "Bolder" });
    expect(loadRegenSetting()).toEqual({ mode: "current-svg", presetName: "Bolder" });
  });

  it("a corrupt payload costs one ignored load", () => {
    localStorage.setItem("iconSplitter.svg.regen.v1", "{not json");
    expect(loadRegenSetting()).toEqual(DEFAULT_REGEN);
  });

  it("resolves the stored setting against the saved presets", () => {
    saveRegenSetting({ mode: "current-svg", presetName: "Bolder" });
    expect(resolveRegen()).toEqual({
      ok: true,
      plan: { kind: "current-svg", presetName: "Bolder", presetText: "Make the strokes bolder and keep the layout." },
    });
    savePresets([]);
    expect(resolveRegen().ok).toBe(false);
  });
});

describe("the plan and the guard read the stored choice (the confirmation shows the same plan)", () => {
  const ctxWithKey = () => ({
    rows: [], m: { config: { ...DEFAULT_CONFIG, imagesPerRequest: 4 } },
    refs: { root: { current: new FakeDir("root") }, key: { current: "key" } },
  });

  beforeEach(() => {
    localStorage.clear();
    savePresets(PRESETS);
  });

  it("counts the configured size in the main mode, one icon per request in the current-SVG mode", () => {
    expect(perRequestOf(ctxWithKey())).toBe(4);
    saveRegenSetting({ mode: "current-svg", presetName: "Bolder" });
    expect(perRequestOf(ctxWithKey())).toBe(1);
  });

  it("the guard refuses a current-SVG run with no usable saved prompt, and names why", () => {
    saveRegenSetting({ mode: "current-svg", presetName: "" });
    expect(guard(ctxWithKey() as unknown as SvgCtx, ["a"])).toContain("saved prompt");
  });

  it("the guard lets a valid choice through", () => {
    saveRegenSetting({ mode: "current-svg", presetName: "Bolder" });
    expect(guard(ctxWithKey() as unknown as SvgCtx, ["a"])).toBeNull();
  });
});
