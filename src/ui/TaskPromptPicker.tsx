// TaskPromptPicker.tsx — ONE prompt picker for every paying popup (2026-10-20).
// The popup knows how many icons it is about to send, so the task is DETECTED,
// never chosen: one icon is the single task, two or more are the batch task.
// Above the list it names that task's default prompt ("Default prompt for this
// task — …"), then offers the choice itself: the main prompt plus every saved
// preset, or only the presets when the work is regeneration. Choosing a value
// is remembered for the task in force, so a single icon and a batch never
// overwrite each other's default. No rule lives here: resolution is
// lib/prompttasks, storage is the caller's.

import { findPreset, type PromptPreset } from "../lib/promptpresets";
import {
  allowsMain, defaultPromptNote, resolveTaskPrompt, taskLabel, taskOf,
  type PromptSources, type PromptTaskId, type PromptWork, type ResolvedTaskPrompt,
  type TaskPromptEntry, type TaskPromptMap,
} from "../lib/prompttasks";

const MAIN_VALUE = "main";

export interface TaskPromptPickerProps {
  /** Test-id prefix: `<id>-default`, `<id>-box`, `<id>-select`, `<id>-note`, `<id>-effective`. */
  testId: string;
  work: PromptWork;
  /** How many icons this popup will send — it decides the task, nothing else does. */
  count: number;
  entries: TaskPromptMap;
  onEntry: (task: PromptTaskId, entry: TaskPromptEntry) => void;
  sources: PromptSources;
  /** What this choice does for the batch in flight, or why it cannot be used. */
  note: string | null;
}

export default function TaskPromptPicker(p: TaskPromptPickerProps) {
  const task = taskOf(p.work, p.count);
  const resolved = resolveTaskPrompt(task, p.entries[task], p.sources);
  return (
    <div className="svg-task-prompt" data-testid={`${p.testId}-box`} data-task={task}>
      <p className="svg-note strong" data-testid={`${p.testId}-default`} data-stale={resolved.stale !== null}>
        {defaultPromptNote(resolved)}
      </p>
      <Choice p={p} task={task} resolved={resolved} />
      <small className="svg-note" data-testid={`${p.testId}-note`}>{p.note ?? ""}</small>
    </div>
  );
}

/** The list itself: main first where it is allowed, then the saved presets. */
function Choice({ p, task, resolved }: { p: TaskPromptPickerProps; task: PromptTaskId; resolved: ResolvedTaskPrompt }) {
  const value = valueOf(resolved, task);
  const pick = (raw: string) => p.onEntry(task, raw === MAIN_VALUE ? { choice: "main", presetName: "" } : { choice: "preset", presetName: raw });
  return (
    <label className="svg-field">
      <span className="svg-label">Prompt — {taskLabel(task).toLowerCase()}</span>
      <select className="svg-input" data-testid={`${p.testId}-select`} aria-label={`Prompt for ${taskLabel(task)}`}
        value={value} onChange={(e) => pick(e.target.value)}>
        {allowsMain(task) && <option value={MAIN_VALUE}>Main prompt (currently loaded)</option>}
        {!offered(value, task, p.sources.presets) && <option value={value} disabled>— pick a saved prompt —</option>}
        {p.sources.presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
      </select>
      {resolved.choice.kind === "preset" && <small className="svg-note" data-testid={`${p.testId}-effective`}>
        Sending the saved prompt “{resolved.choice.name}” — the prompt window is not changed.
      </small>}
    </label>
  );
}

/** The list shows what the batch will REALLY send, so a fallback is visible. */
function valueOf(resolved: ResolvedTaskPrompt, task: PromptTaskId): string {
  if (resolved.choice.kind === "preset") return resolved.choice.name;
  return allowsMain(task) ? MAIN_VALUE : "";
}

/** A placeholder is shown only when the value cannot be picked from the list. */
function offered(value: string, task: PromptTaskId, presets: readonly PromptPreset[]): boolean {
  return value === MAIN_VALUE ? allowsMain(task) : findPreset(presets, value) !== null;
}
