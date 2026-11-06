// @vitest-environment node
// prompttasks.test.ts — the six prompt tasks (2026-10-20). One unit per work x
// shape; each remembers its own last choice; the picker's message names the
// default of the task being looked at. Locks the fallbacks: a deleted preset is
// named, never silently replaced, and regeneration cannot run on "main".
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_PROMPTS, PROMPT_TASK_IDS, allowsMain, defaultPromptNote, parseTaskPrompts, resolveTaskPrompt,
  serializeTaskPrompts, taskLabel, taskOf, tasksOf, withTaskEntry, type TaskPromptMap,
} from "../src/lib/prompttasks";
import type { PromptPreset } from "../src/lib/promptpresets";

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make the strokes bolder." },
  { name: "Blank", text: "  " },
];
const MAIN = "the stored main prompt";

const ctx = { presets: PRESETS, mainPrompt: MAIN };

describe("taskOf — the shape decides the task", () => {
  it("maps work and count to one of the six ids", () => {
    expect(taskOf("svg.generate", 1)).toBe("svg.generate.single");
    expect(taskOf("svg.generate", 2)).toBe("svg.generate.batch");
    expect(taskOf("svg.generate", 9)).toBe("svg.generate.batch");
    expect(taskOf("svg.regenerate", 1)).toBe("svg.regenerate.single");
    expect(taskOf("svg.regenerate", 5)).toBe("svg.regenerate.batch");
    expect(taskOf("image.edit", 1)).toBe("image.edit.single");
    expect(taskOf("image.edit", 4)).toBe("image.edit.batch");
  });

  it("has exactly the six tasks, each with a readable label", () => {
    expect([...PROMPT_TASK_IDS].sort()).toEqual([
      "image.edit.batch", "image.edit.single", "svg.generate.batch", "svg.generate.single",
      "svg.regenerate.batch", "svg.regenerate.single",
    ]);
    expect(taskLabel("svg.regenerate.batch")).toBe("Regenerate SVG · batch");
    expect(taskLabel("image.edit.single")).toBe("AI source image · single icon");
  });

  it("pairs single and batch inside one work", () => {
    expect(tasksOf("svg.generate")).toEqual(["svg.generate.single", "svg.generate.batch"]);
  });

  it("only regeneration refuses the main prompt", () => {
    expect(allowsMain("svg.generate.batch")).toBe(true);
    expect(allowsMain("image.edit.batch")).toBe(true);
    expect(allowsMain("svg.regenerate.single")).toBe(false);
  });
});

describe("parseTaskPrompts — one bad entry never costs the rest (RULE 13)", () => {
  it("starts with every task on the main prompt", () => {
    expect(parseTaskPrompts(null)).toEqual(DEFAULT_TASK_PROMPTS);
    expect(parseTaskPrompts({ v: 2, tasks: {} })).toEqual(DEFAULT_TASK_PROMPTS);
  });

  it("keeps valid entries and drops the foreign ones", () => {
    const map = parseTaskPrompts({
      v: 1,
      tasks: {
        "svg.generate.batch": { choice: "preset", presetName: " Bolder " },
        "svg.regenerate.single": { choice: "main" },
        "svg.unknown.task": { choice: "preset", presetName: "Bolder" },
        "image.edit.batch": { choice: "preset", presetName: "x".repeat(80) },
        "svg.generate.single": "junk",
      },
    });
    expect(map["svg.generate.batch"]).toEqual({ choice: "preset", presetName: "Bolder" });
    expect(map["svg.regenerate.single"]).toEqual({ choice: "main", presetName: "" });
    expect(map["svg.generate.single"]).toEqual(DEFAULT_TASK_PROMPTS["svg.generate.single"]);
    expect(map["image.edit.batch"]).toEqual(DEFAULT_TASK_PROMPTS["image.edit.batch"]);
    expect(Object.keys(map).sort()).toEqual([...PROMPT_TASK_IDS].sort());
  });

  it("round-trips through serialize", () => {
    const map = withTaskEntry(DEFAULT_TASK_PROMPTS, "svg.regenerate.batch", { choice: "preset", presetName: "Bolder" });
    expect(parseTaskPrompts(JSON.parse(serializeTaskPrompts(map)))).toEqual(map);
  });
});

describe("withTaskEntry — one task changes, the others stay", () => {
  it("does not leak between single and batch", () => {
    const map = withTaskEntry(DEFAULT_TASK_PROMPTS, "svg.generate.single", { choice: "preset", presetName: "Bolder" });
    expect(map["svg.generate.single"].presetName).toBe("Bolder");
    expect(map["svg.generate.batch"]).toEqual(DEFAULT_TASK_PROMPTS["svg.generate.batch"]);
  });
});

describe("resolveTaskPrompt — what the batch will really use", () => {
  it("the main choice hands over the stored main prompt", () => {
    const out = resolveTaskPrompt("svg.generate.batch", { choice: "main", presetName: "" }, ctx);
    expect(out.choice).toEqual({ kind: "main" });
    expect(out.stale).toBeNull();
    expect(out.problem).toBeNull();
  });

  it("a stored preset hands over its text, and a blank one is a refusal", () => {
    const good = resolveTaskPrompt("svg.generate.single", { choice: "preset", presetName: "Bolder" }, ctx);
    expect(good.choice).toEqual({ kind: "preset", name: "Bolder", text: "Make the strokes bolder." });
    expect(good.problem).toBeNull();
    const blank = resolveTaskPrompt("svg.generate.single", { choice: "preset", presetName: "Blank" }, ctx);
    expect(blank.problem).toContain("empty");
  });

  it("names a preset that is gone and falls back to main with a stale note", () => {
    const out = resolveTaskPrompt("svg.generate.batch", { choice: "preset", presetName: "Gone" }, ctx);
    expect(out.choice).toEqual({ kind: "main" });
    expect(out.stale).toBe("Gone");
    expect(out.problem).toBeNull();
  });

  it("regeneration falls back to the first saved prompt, and refuses when there is none", () => {
    const fallback = resolveTaskPrompt("svg.regenerate.batch", { choice: "main", presetName: "" }, ctx);
    expect(fallback.choice).toEqual({ kind: "preset", name: "Bolder", text: "Make the strokes bolder." });
    const none = resolveTaskPrompt("svg.regenerate.batch", { choice: "main", presetName: "" }, { presets: [], mainPrompt: MAIN });
    expect(none.problem).toContain("No saved prompts");
  });

  it("a regeneration preset that is gone moves to the first usable one and says so", () => {
    const out = resolveTaskPrompt("svg.regenerate.single", { choice: "preset", presetName: "Gone" }, ctx);
    expect(out.stale).toBe("Gone");
    expect(out.choice).toEqual({ kind: "preset", name: "Bolder", text: "Make the strokes bolder." });
  });
});

describe("defaultPromptNote — the message above the picker", () => {
  const note = (task: Parameters<typeof resolveTaskPrompt>[0], entry: TaskPromptMap[keyof TaskPromptMap], c = ctx) =>
    defaultPromptNote(resolveTaskPrompt(task, entry, c));

  it("names the main prompt, a preset, a gone preset and a missing list", () => {
    expect(note("svg.generate.batch", { choice: "main", presetName: "" }))
      .toBe("Default prompt for this task — main prompt (currently loaded)");
    expect(note("svg.generate.batch", { choice: "preset", presetName: "Bolder" }))
      .toBe("Default prompt for this task — “Bolder”");
    expect(note("svg.generate.batch", { choice: "preset", presetName: "Gone" }))
      .toContain("“Gone” is gone");
    expect(note("svg.regenerate.single", { choice: "main", presetName: "" }, { presets: [], mainPrompt: MAIN }))
      .toContain("No saved prompts");
  });
});
