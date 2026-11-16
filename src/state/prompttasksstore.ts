// prompttasksstore.ts — the six prompt tasks' remembered choices (2026-10-20,
// RULE 13). One validated map, one key: reading it can never throw, and one
// foreign task entry costs only itself (lib/prompttasks owns the rules).

import {
  parseTaskPrompts, serializeTaskPrompts, withTaskEntry,
  type TaskPromptEntry, type PromptTaskId, type TaskPromptMap,
} from "../lib/prompttasks";
import { readKey, writeKey } from "./safestorage";

export const TASK_PROMPTS_KEY = "iconSplitter.svg.promptTasks.v1";

/** Never throws: a corrupt payload costs one ignored load and the defaults. */
export function loadTaskPrompts(): TaskPromptMap {
  const text = readKey(TASK_PROMPTS_KEY);
  if (!text) return parseTaskPrompts(null);
  try {
    return parseTaskPrompts(JSON.parse(text));
  } catch {
    return parseTaskPrompts(null);
  }
}

/** Remembers one task's choice and returns the whole map it wrote. */
export function saveTaskEntry(task: PromptTaskId, entry: TaskPromptEntry): TaskPromptMap {
  const map = withTaskEntry(loadTaskPrompts(), task, entry);
  writeKey(TASK_PROMPTS_KEY, serializeTaskPrompts(map));
  return map;
}
