// taskprompt.ts — the ONE answer to "which prompt does this task send right
// now?" (2026-10-20). It reads the six tasks' stored choices and resolves them
// against the saved presets, so the popup, the queue and the image-edit run all
// ask the same question of the same data. Nothing here writes.

import { choiceText, resolveTaskPrompt, taskOf, type PromptChoice, type PromptWork } from "../lib/prompttasks";
import type { PromptPreset } from "../lib/promptpresets";
import { loadTaskPrompts } from "../state/prompttasksstore";

/** What the resolution needs — satisfied by SvgCtx's model. */
export interface PromptCarrier {
  m: { prompt: string; presets: readonly PromptPreset[] };
}

/** The choice this work remembers for a selection of `count` icons. */
export function taskChoiceOf(c: PromptCarrier, work: PromptWork, count: number): PromptChoice {
  const task = taskOf(work, count);
  const entry = loadTaskPrompts()[task];
  return resolveTaskPrompt(task, entry, { presets: c.m.presets, mainPrompt: c.m.prompt }).choice;
}

/** The text it sends: the preset's own, or the stored main prompt. */
export function taskPromptOf(c: PromptCarrier, work: PromptWork, count: number): string {
  return choiceText(taskChoiceOf(c, work, count), c.m.prompt);
}
