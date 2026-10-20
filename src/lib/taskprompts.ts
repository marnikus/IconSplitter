// Per-task × single/batch default prompt model (pure, storage-agnostic).
// Every provider dialog resolves its remembered prompt preset independently by
// (operation, scope) so single-icon and multi-icon batch runs never overwrite each other.

export const MAIN_PROMPT_VALUE = "__main__";

export type PromptOperation =
  | "svg-generate"
  | "svg-regenerate"
  | "svg-image"
  | "upload-generate"
  | "upload-regenerate";

export type PromptScope = "single" | "batch";

export type PromptTaskId = `${PromptOperation}:${PromptScope}`;

export type TaskPromptChoice =
  | { kind: "main" }
  | { kind: "preset"; name: string };

export type TaskPromptMap = Partial<Record<PromptTaskId, TaskPromptChoice>>;

export interface PromptPresetLike {
  readonly name: string;
  readonly text: string;
}

export interface ResolveTaskPromptArgs {
  readonly taskId: PromptTaskId;
  readonly stored: TaskPromptMap;
  readonly presets: readonly PromptPresetLike[];
  readonly mainPrompt: string;
  readonly legacyPresetName?: string;
}

export interface ResolvedTaskPrompt {
  readonly taskId: PromptTaskId;
  readonly taskLabel: string;
  readonly requiresPreset: boolean;
  readonly selectValue: string;
  readonly presetName: string | null;
  readonly text: string;
  readonly defaultMessage: string;
  readonly problem: string | null;
}

const LABELS: Record<PromptTaskId, string> = {
  "svg-generate:single": "SVG generation · single icon",
  "svg-generate:batch": "SVG generation · batch (multiple icons)",
  "svg-regenerate:single": "SVG regeneration · single icon",
  "svg-regenerate:batch": "SVG regeneration · batch (multiple icons)",
  "svg-image:single": "AI source image · single icon",
  "svg-image:batch": "AI source image · batch (multiple icons)",
  "upload-generate:single": "Metadata generation · single icon",
  "upload-generate:batch": "Metadata generation · batch (multiple icons)",
  "upload-regenerate:single": "Metadata regeneration · single icon",
  "upload-regenerate:batch": "Metadata regeneration · batch (multiple icons)",
};

export const ALL_PROMPT_TASK_IDS = Object.keys(LABELS) as readonly PromptTaskId[];
const VALID_IDS = new Set<string>(ALL_PROMPT_TASK_IDS);

export function taskIdOf(operation: PromptOperation, scope: PromptScope): PromptTaskId {
  return `${operation}:${scope}`;
}

export function taskLabelOf(taskId: PromptTaskId): string {
  return LABELS[taskId];
}

export function scopeOfTask(itemCount: number, perRequest: number, compositeCapable: boolean): PromptScope {
  if (compositeCapable) return itemCount > 1 && perRequest > 1 ? "batch" : "single";
  return itemCount > 1 ? "batch" : "single";
}

function parseEntry(raw: unknown): TaskPromptChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { kind?: unknown; name?: unknown };
  if (obj.kind === "main") return { kind: "main" };
  if (obj.kind === "preset" && typeof obj.name === "string" && obj.name.trim()) {
    return { kind: "preset", name: obj.name.trim() };
  }
  return null;
}

export function parseTaskPrompts(raw: string | null): TaskPromptMap {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as { v?: unknown; defaults?: unknown };
    if (data?.v !== 1 || !data.defaults || typeof data.defaults !== "object") return {};
    const out: TaskPromptMap = {};
    for (const [k, v] of Object.entries(data.defaults as Record<string, unknown>)) {
      if (!VALID_IDS.has(k)) continue;
      const entry = parseEntry(v);
      if (entry) out[k as PromptTaskId] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeTaskPrompts(map: TaskPromptMap): string {
  return JSON.stringify({ v: 1, defaults: map });
}

export function choiceFromSelectValue(value: string): TaskPromptChoice | null {
  if (value === MAIN_PROMPT_VALUE) return { kind: "main" };
  const trimmed = value.trim();
  return trimmed ? { kind: "preset", name: trimmed } : null;
}

function findPreset(list: readonly PromptPresetLike[], name: string | undefined): PromptPresetLike | null {
  if (!name) return null;
  return list.find((p) => p.name === name) ?? null;
}

function deletedNote(deletedName: string | null): string {
  return deletedName ? ` (saved preset “${deletedName}” was deleted)` : "";
}

function resolveRegenTask(
  taskId: PromptTaskId, taskLabel: string, args: ResolveTaskPromptArgs, deletedName: string | null,
): ResolvedTaskPrompt {
  const saved = args.stored[taskId];
  const explicit = saved?.kind === "preset" ? findPreset(args.presets, saved.name) : null;
  const picked = explicit ?? findPreset(args.presets, args.legacyPresetName) ?? args.presets[0] ?? null;
  if (!picked) {
    return {
      taskId, taskLabel, requiresPreset: true, selectValue: "", presetName: null, text: "",
      defaultMessage: `Default prompt for ${taskLabel}: None${deletedNote(deletedName)} — save a prompt preset first`,
      problem: "No saved prompts yet. Save a regeneration prompt in the Prompt window above, then try again.",
    };
  }
  const problem = picked.text.trim() ? null : `The saved prompt "${picked.name}" is empty.`;
  return {
    taskId, taskLabel, requiresPreset: true, selectValue: picked.name, presetName: picked.name, text: picked.text,
    defaultMessage: `Default prompt for ${taskLabel}: “${picked.name}”${deletedNote(deletedName)}`,
    problem,
  };
}

export function resolveTaskPrompt(args: ResolveTaskPromptArgs): ResolvedTaskPrompt {
  const { taskId, stored, presets, mainPrompt } = args;
  const taskLabel = taskLabelOf(taskId);
  const saved = stored[taskId];
  const deletedName = saved?.kind === "preset" && !findPreset(presets, saved.name) ? saved.name : null;
  if (taskId.startsWith("svg-regenerate:")) {
    return resolveRegenTask(taskId, taskLabel, args, deletedName);
  }
  const picked = saved?.kind === "preset" ? findPreset(presets, saved.name) : null;
  if (picked) {
    return {
      taskId, taskLabel, requiresPreset: false, selectValue: picked.name, presetName: picked.name, text: picked.text,
      defaultMessage: `Default prompt for ${taskLabel}: “${picked.name}”`,
      problem: null,
    };
  }
  return {
    taskId, taskLabel, requiresPreset: false, selectValue: MAIN_PROMPT_VALUE, presetName: null, text: mainPrompt,
    defaultMessage: `Default prompt for ${taskLabel}: Main editor prompt${deletedNote(deletedName)}`,
    problem: null,
  };
}
