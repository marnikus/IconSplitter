// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ALL_PROMPT_TASK_IDS,
  MAIN_PROMPT_VALUE,
  choiceFromSelectValue,
  parseTaskPrompts,
  resolveTaskPrompt,
  scopeOfTask,
  serializeTaskPrompts,
  taskIdOf,
  taskLabelOf,
  type PromptPresetLike,
} from "../src/lib/taskprompts";
import { loadTaskPrompts, saveTaskPromptChoice, TASK_PROMPTS_STORAGE_KEY } from "../src/state/taskpromptstore";

const PRESETS: readonly PromptPresetLike[] = [
  { name: "Single Crisp", text: "Redraw 1 clean vector icon." },
  { name: "Batch Grid 4", text: "Redraw all grid icons cleanly." },
];

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k: string) { return map.get(k) ?? null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(k: string) { map.delete(k); },
    setItem(k: string, v: string) { map.set(k, v); },
  };
}

describe("taskprompts — 10-slot task × scope model", () => {
  it("defines all 10 distinct (operation, single | batch) task IDs with distinct labels", () => {
    expect(ALL_PROMPT_TASK_IDS).toHaveLength(10);
    const labels = new Set(ALL_PROMPT_TASK_IDS.map((id) => taskLabelOf(id)));
    expect(labels.size).toBe(10);
    expect(taskIdOf("svg-generate", "single")).toBe("svg-generate:single");
    expect(taskIdOf("svg-regenerate", "batch")).toBe("svg-regenerate:batch");
    expect(taskIdOf("svg-image", "single")).toBe("svg-image:single");
    expect(taskIdOf("upload-generate", "batch")).toBe("upload-generate:batch");
    expect(taskIdOf("upload-regenerate", "single")).toBe("upload-regenerate:single");
  });

  it("computes single vs batch scope accurately for composite and metadata tasks", () => {
    expect(scopeOfTask(1, 4, true)).toBe("single");
    expect(scopeOfTask(5, 1, true)).toBe("single");
    expect(scopeOfTask(5, 4, true)).toBe("batch");
    expect(scopeOfTask(1, 50, false)).toBe("single");
    expect(scopeOfTask(2, 50, false)).toBe("batch");
  });

  it("validates untrusted storage payloads per RULE 13", () => {
    expect(parseTaskPrompts(null)).toEqual({});
    expect(parseTaskPrompts("{broken-json")).toEqual({});
    expect(parseTaskPrompts(JSON.stringify({ v: 99, defaults: { "svg-generate:single": { kind: "main" } } }))).toEqual({});
    const raw = serializeTaskPrompts({
      "svg-generate:single": { kind: "preset", name: "Single Crisp" },
      "svg-generate:batch": { kind: "main" },
    });
    const parsed = parseTaskPrompts(raw);
    expect(parsed).toEqual({
      "svg-generate:single": { kind: "preset", name: "Single Crisp" },
      "svg-generate:batch": { kind: "main" },
    });
    // Drops unknown keys and malformed entries while preserving valid ones.
    const mixed = JSON.stringify({
      v: 1,
      defaults: {
        "svg-image:single": { kind: "preset", name: "Single Crisp" },
        "svg-image:batch": { kind: "preset", name: "   " },
        "unknown:single": { kind: "main" },
      },
    });
    expect(parseTaskPrompts(mixed)).toEqual({
      "svg-image:single": { kind: "preset", name: "Single Crisp" },
    });
  });

  it("resolves main prompt, saved presets, deleted presets, and required-preset tasks honestly", () => {
    const firstVisitGen = resolveTaskPrompt({
      taskId: "svg-generate:batch",
      stored: {},
      presets: PRESETS,
      mainPrompt: "Main editor text",
    });
    expect(firstVisitGen.selectValue).toBe(MAIN_PROMPT_VALUE);
    expect(firstVisitGen.text).toBe("Main editor text");
    expect(firstVisitGen.defaultMessage).toContain("SVG generation · batch");
    expect(firstVisitGen.defaultMessage).toContain("Main editor prompt");
    expect(firstVisitGen.problem).toBeNull();

    const rememberedSingle = resolveTaskPrompt({
      taskId: "svg-generate:single",
      stored: { "svg-generate:single": { kind: "preset", name: "Single Crisp" } },
      presets: PRESETS,
      mainPrompt: "Main editor text",
    });
    expect(rememberedSingle.selectValue).toBe("Single Crisp");
    expect(rememberedSingle.presetName).toBe("Single Crisp");
    expect(rememberedSingle.text).toBe("Redraw 1 clean vector icon.");
    expect(rememberedSingle.defaultMessage).toContain("“Single Crisp”");

    const deletedOptional = resolveTaskPrompt({
      taskId: "upload-generate:batch",
      stored: { "upload-generate:batch": { kind: "preset", name: "Gone Preset" } },
      presets: PRESETS,
      mainPrompt: "Main upload prompt",
    });
    expect(deletedOptional.selectValue).toBe(MAIN_PROMPT_VALUE);
    expect(deletedOptional.text).toBe("Main upload prompt");
    expect(deletedOptional.defaultMessage).toContain("Gone Preset");
    expect(deletedOptional.defaultMessage).toContain("deleted");

    const legacyRegen = resolveTaskPrompt({
      taskId: "svg-regenerate:batch",
      stored: {},
      presets: PRESETS,
      mainPrompt: "Main editor text",
      legacyPresetName: "Batch Grid 4",
    });
    expect(legacyRegen.selectValue).toBe("Batch Grid 4");
    expect(legacyRegen.text).toBe("Redraw all grid icons cleanly.");
    expect(legacyRegen.problem).toBeNull();

    const emptyRegen = resolveTaskPrompt({
      taskId: "svg-regenerate:single",
      stored: { "svg-regenerate:single": { kind: "preset", name: "Gone" } },
      presets: [],
      mainPrompt: "Main editor text",
    });
    expect(emptyRegen.selectValue).toBe("");
    expect(emptyRegen.problem).toMatch(/No saved prompts yet/i);
    expect(emptyRegen.defaultMessage).toContain("None");
  });

  it("maps select values back to TaskPromptChoice and persists independently per slot", () => {
    expect(choiceFromSelectValue(MAIN_PROMPT_VALUE)).toEqual({ kind: "main" });
    expect(choiceFromSelectValue("Single Crisp")).toEqual({ kind: "preset", name: "Single Crisp" });
    expect(choiceFromSelectValue("   ")).toBeNull();

    const storage = makeMemoryStorage();
    saveTaskPromptChoice("svg-image:single", { kind: "preset", name: "Single Crisp" }, storage);
    saveTaskPromptChoice("svg-image:batch", { kind: "preset", name: "Batch Grid 4" }, storage);
    expect(storage.getItem(TASK_PROMPTS_STORAGE_KEY)).toBeTruthy();
    expect(loadTaskPrompts(storage)).toEqual({
      "svg-image:single": { kind: "preset", name: "Single Crisp" },
      "svg-image:batch": { kind: "preset", name: "Batch Grid 4" },
    });
  });
});
