// svg_taskprompt.test.ts — one resolution for the popups and the runs
// (2026-10-20). The image edit reads the task's remembered choice at send time,
// so a preset batch cannot be refused for a textarea that was never touched.
import { beforeEach, describe, expect, it } from "vitest";
import type { PromptPreset } from "../src/lib/promptpresets";
import { saveTaskEntry } from "../src/state/prompttasksstore";
import { taskChoiceOf, taskPromptOf } from "../src/svg/taskprompt";

const PRESETS: PromptPreset[] = [
  { name: "Bolder", text: "Make the lines bolder." },
  { name: "Simpler", text: "Fewer details." },
];
const carrier = { m: { prompt: "the main prompt", presets: PRESETS } };

beforeEach(() => {
  window.localStorage.clear();
});

describe("taskPromptOf — what a run really sends", () => {
  it("uses the main prompt when the task remembers it", () => {
    expect(taskChoiceOf(carrier, "image.edit", 1)).toEqual({ kind: "main" });
    expect(taskPromptOf(carrier, "image.edit", 3)).toBe("the main prompt");
  });

  it("uses the remembered preset's own text, never the textarea's", () => {
    saveTaskEntry("image.edit.batch", { choice: "preset", presetName: "Bolder" });
    expect(taskPromptOf(carrier, "image.edit", 3)).toBe("Make the lines bolder.");
    // the single-icon task kept its own memory
    expect(taskPromptOf(carrier, "image.edit", 1)).toBe("the main prompt");
  });

  it("falls back to the main prompt when the remembered preset is gone", () => {
    saveTaskEntry("image.edit.single", { choice: "preset", presetName: "Deleted" });
    expect(taskPromptOf(carrier, "image.edit", 1)).toBe("the main prompt");
  });
});
