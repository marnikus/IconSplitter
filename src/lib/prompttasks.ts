// prompttasks.ts — the six prompt tasks (2026-10-20). One prompt choice is
// remembered per task (the work x the shape of the batch), so a single icon and
// a batch of nine never overwrite each other's default. Pure: no storage and no
// IO — the store hands the validated map in, the picker renders what this
// module resolves. A preset that no longer exists is NAMED (`stale`), never
// silently replaced, and regeneration cannot fall back to the main prompt.

import { PRESET_NAME_MAX, findPreset, validPresetName, type PromptPreset } from "./promptpresets";
import { isRecord } from "./isrecord";

export const PROMPT_TASKS_VERSION = 1;

/** The work a popup does; the shape splits each work into two tasks. */
export type PromptWork = "svg.generate" | "svg.regenerate" | "image.edit";
export type PromptShape = "single" | "batch";

export type PromptTaskId =
  | "svg.generate.single" | "svg.generate.batch"
  | "svg.regenerate.single" | "svg.regenerate.batch"
  | "image.edit.single" | "image.edit.batch";

export const PROMPT_TASK_IDS: readonly PromptTaskId[] = [
  "svg.generate.single", "svg.generate.batch",
  "svg.regenerate.single", "svg.regenerate.batch",
  "image.edit.single", "image.edit.batch",
];

/** What one task remembers: the main prompt, or a saved preset by name. */
export interface TaskPromptEntry {
  choice: "main" | "preset";
  presetName: string;
}

export type TaskPromptMap = Record<PromptTaskId, TaskPromptEntry>;

export const MAIN_ENTRY: TaskPromptEntry = { choice: "main", presetName: "" };

export const DEFAULT_TASK_PROMPTS: TaskPromptMap = {
  "svg.generate.single": MAIN_ENTRY, "svg.generate.batch": MAIN_ENTRY,
  "svg.regenerate.single": MAIN_ENTRY, "svg.regenerate.batch": MAIN_ENTRY,
  "image.edit.single": MAIN_ENTRY, "image.edit.batch": MAIN_ENTRY,
};

/** The prompt a batch will really send: the stored main text or a preset's own. */
export type PromptChoice = { kind: "main" } | { kind: "preset"; name: string; text: string };

/** One selected icon is the single task, two or more are the batch task. */
export function taskOf(work: PromptWork, count: number): PromptTaskId {
  const shape: PromptShape = count > 1 ? "batch" : "single";
  return `${work}.${shape}` as PromptTaskId;
}

/** The task of one shape — the tab row and the task badge both use it. */
export function taskFor(work: PromptWork, shape: PromptShape): PromptTaskId {
  return `${work}.${shape}` as PromptTaskId;
}

export function workOf(task: PromptTaskId): PromptWork {
  return task.slice(0, task.lastIndexOf(".")) as PromptWork;
}

export function shapeOf(task: PromptTaskId): PromptShape {
  return task.endsWith(".batch") ? "batch" : "single";
}

export function tasksOf(work: PromptWork): [PromptTaskId, PromptTaskId] {
  return [taskFor(work, "single"), taskFor(work, "batch")];
}

const LABELS: Record<PromptWork, string> = {
  "svg.generate": "Generate SVG",
  "svg.regenerate": "Regenerate SVG",
  "image.edit": "AI source image",
};

const SHAPES: Record<PromptShape, string> = { single: "single icon", batch: "batch" };

/** "Regenerate SVG · batch" — the badge and the tab row read this one label. */
export function taskLabel(task: PromptTaskId): string {
  return `${LABELS[workOf(task)]} · ${SHAPES[shapeOf(task)]}`;
}

/** Regeneration always needs a saved prompt; the other tasks may use main. */
export function allowsMain(task: PromptTaskId): boolean {
  return workOf(task) !== "svg.regenerate";
}

/** Stored value → map: one bad task costs only itself (RULE 13). */
export function parseTaskPrompts(raw: unknown): TaskPromptMap {
  const out: TaskPromptMap = { ...DEFAULT_TASK_PROMPTS };
  if (!isRecord(raw) || raw.v !== PROMPT_TASKS_VERSION || !isRecord(raw.tasks)) return out;
  for (const id of PROMPT_TASK_IDS) out[id] = entryOf(raw.tasks[id]) ?? MAIN_ENTRY;
  return out;
}

function entryOf(raw: unknown): TaskPromptEntry | null {
  if (!isRecord(raw)) return null;
  if (raw.choice === "main") return MAIN_ENTRY;
  if (raw.choice !== "preset") return null;
  const name = typeof raw.presetName === "string" ? validPresetName(raw.presetName) : null;
  if (name === null || name.length > PRESET_NAME_MAX) return null;
  return { choice: "preset", presetName: name };
}

export function serializeTaskPrompts(map: TaskPromptMap): string {
  const tasks: Record<string, TaskPromptEntry> = {};
  for (const id of PROMPT_TASK_IDS) {
    const entry = map[id];
    tasks[id] = entry.choice === "preset" ? { choice: "preset", presetName: entry.presetName } : MAIN_ENTRY;
  }
  return JSON.stringify({ v: PROMPT_TASKS_VERSION, tasks });
}

/** One task changes; every other task keeps its own memory. */
export function withTaskEntry(map: TaskPromptMap, task: PromptTaskId, entry: TaskPromptEntry): TaskPromptMap {
  return { ...map, [task]: entry };
}

/** What the resolve step needs: the saved presets and the stored main prompt. */
export interface PromptSources {
  presets: readonly PromptPreset[];
  mainPrompt: string;
}

/** The result the popup shows and the batch carries. */
export interface ResolvedTaskPrompt {
  choice: PromptChoice;
  /** The preset name that no longer exists, when a fallback happened. */
  stale: string | null;
  /** Why the batch cannot be confirmed, or null. */
  problem: string | null;
}

export const NO_PRESETS_PROBLEM =
  "No saved prompts yet — save one in the prompt window first; regeneration needs one";

/**
 * The prompt this task will use. A stored preset that is gone falls back to the
 * main prompt (generation/image) or to the first usable preset (regeneration)
 * and reports the loss; a blank preset is a refusal, never an empty send.
 */
export function resolveTaskPrompt(task: PromptTaskId, entry: TaskPromptEntry, src: PromptSources): ResolvedTaskPrompt {
  if (entry.choice === "preset") {
    const preset = findPreset(src.presets, entry.presetName);
    if (preset !== null) return fromPreset(preset);
    const fallback = fallbackFor(task, src);
    return { ...fallback, stale: entry.presetName };
  }
  if (allowsMain(task)) return { choice: { kind: "main" }, stale: null, problem: null };
  return fallbackFor(task, src);
}

function fromPreset(preset: PromptPreset): ResolvedTaskPrompt {
  if (preset.text.trim() === "") {
    return { choice: { kind: "preset", name: preset.name, text: preset.text }, stale: null,
      problem: `The saved prompt “${preset.name}” is empty — write it again in the prompt window` };
  }
  return { choice: { kind: "preset", name: preset.name, text: preset.text }, stale: null, problem: null };
}

function fallbackFor(task: PromptTaskId, src: PromptSources): ResolvedTaskPrompt {
  if (allowsMain(task)) return { choice: { kind: "main" }, stale: null, problem: null };
  const usable = src.presets.find((p) => p.text.trim() !== "");
  if (usable === undefined) return { choice: { kind: "main" }, stale: null, problem: NO_PRESETS_PROBLEM };
  return fromPreset(usable);
}

/** The message ABOVE the picker: which default this task has right now. */
export function defaultPromptNote(resolved: ResolvedTaskPrompt): string {
  if (resolved.stale !== null) return `Default prompt “${resolved.stale}” is gone — using ${described(resolved)}; pick another`;
  if (resolved.problem !== null) return resolved.problem;
  return `Default prompt for this task — ${described(resolved)}`;
}

function described(resolved: ResolvedTaskPrompt): string {
  return resolved.choice.kind === "main" ? "main prompt (currently loaded)" : `“${resolved.choice.name}”`;
}

/** The text a batch sends for a resolved choice: the preset's own, or main. */
export function choiceText(choice: PromptChoice, mainPrompt: string): string {
  return choice.kind === "main" ? mainPrompt : choice.text;
}
