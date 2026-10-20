// TaskPromptPicker.tsx — ONE prompt picker for every paying popup (2026-10-20).
// It shows, above the list, which prompt is the default for the task in force
// ("Default prompt for this task — …"), the Single/Batch tabs of that work (each
// shape remembers its own default), and the choice itself: the main prompt plus
// every saved preset, or only the presets when the work is regeneration.
// No rule lives here: resolution is lib/prompttasks, storage is the caller's.

import { findPreset, type PromptPreset } from "../lib/promptpresets";
import {
  allowsMain, defaultPromptNote, resolveTaskPrompt, shapeOf, taskFor, taskLabel,
  type PromptShape, type PromptSources, type PromptTaskId, type PromptWork, type ResolvedTaskPrompt,
  type TaskPromptEntry, type TaskPromptMap,
} from "../lib/prompttasks";

const MAIN_VALUE = "main";

export interface TaskPromptPickerProps {
  /** Test-id prefix: `<id>-default`, `<id>-tabs`, `<id>-single`, `<id>-batch`, `<id>-select`, `<id>-note`. */
  testId: string;
  work: PromptWork;
  /** What the popup will really send, so its own tab is the active one. */
  count: number;
  /** Which shape's default is being looked at (a tab switch, never the batch's own). */
  view: PromptShape;
  onView: (shape: PromptShape) => void;
  entries: TaskPromptMap;
  onEntry: (task: PromptTaskId, entry: TaskPromptEntry) => void;
  sources: PromptSources;
  /** What this choice does for the batch in flight, or why it cannot be used. */
  note: string | null;
}

export default function TaskPromptPicker(p: TaskPromptPickerProps) {
  const { view, own } = shapesOf(p);
  const task = taskFor(p.work, view);
  const resolved = resolveTaskPrompt(task, p.entries[task], p.sources);
  return (
    <div className="svg-task-prompt" data-testid={`${p.testId}-box`} data-task={task}>
      <p className="svg-note strong" data-testid={`${p.testId}-default`} data-stale={resolved.stale !== null}>
        {defaultPromptNote(resolved)}
      </p>
      <Tabs p={p} view={view} own={own} />
      <Choice p={p} task={task} resolved={resolved} />
      <small className="svg-note" data-testid={`${p.testId}-note`}>{p.note ?? ""}</small>
    </div>
  );
}

function shapesOf(p: TaskPromptPickerProps): { view: PromptShape; own: PromptShape } {
  return { view: p.view, own: shapeOf(taskFor(p.work, p.count > 1 ? "batch" : "single")) };
}

/** Single / batch: the one this popup sends is marked and cannot be hidden. */
function Tabs({ p, view, own }: { p: TaskPromptPickerProps; view: PromptShape; own: PromptShape }) {
  const shapes: PromptShape[] = ["single", "batch"];
  return (
    <div className="svg-task-tabs" role="tablist" aria-label="Prompt task" data-testid={`${p.testId}-tabs`}>
      {shapes.map((shape) => (
        <button key={shape} type="button" role="tab" aria-selected={view === shape}
          className={`svg-btn tiny${view === shape ? " primary" : ""}`} data-testid={`${p.testId}-${shape}`}
          data-own={shape === own} onClick={() => p.onView(shape)}>
          {shape === "single" ? "Single icon" : "Batch"}
        </button>
      ))}
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
