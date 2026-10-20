// Persistence for per-task × single/batch default prompt choices.
import {
  parseTaskPrompts,
  serializeTaskPrompts,
  type PromptTaskId,
  type TaskPromptChoice,
  type TaskPromptMap,
} from "../lib/taskprompts";

export const TASK_PROMPTS_STORAGE_KEY = "iconSplitter.taskPrompts.v1";

function safeStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadTaskPrompts(storage?: Storage): TaskPromptMap {
  const s = safeStorage(storage);
  if (!s) return {};
  try {
    return parseTaskPrompts(s.getItem(TASK_PROMPTS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveTaskPromptChoice(
  taskId: PromptTaskId,
  choice: TaskPromptChoice,
  storage?: Storage,
): TaskPromptMap {
  const s = safeStorage(storage);
  const next: TaskPromptMap = { ...loadTaskPrompts(s ?? undefined), [taskId]: choice };
  if (!s) return next;
  try {
    s.setItem(TASK_PROMPTS_STORAGE_KEY, serializeTaskPrompts(next));
  } catch { /* full or locked storage — in-memory state still works for this dialog */ }
  return next;
}
