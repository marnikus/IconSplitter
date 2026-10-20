// Shared popup prompt preset picker + active-default status banner (RULE 24).
// Renders the current remembered default prompt directly above the preset list
// for the active (operation, single | batch) task slot and persists changes live.

import { useCallback, useState } from "react";
import {
  MAIN_PROMPT_VALUE,
  choiceFromSelectValue,
  resolveTaskPrompt,
  taskIdOf,
  type PromptOperation,
  type PromptPresetLike,
  type PromptScope,
  type ResolvedTaskPrompt,
  type TaskPromptMap,
} from "../lib/taskprompts";
import { loadTaskPrompts, saveTaskPromptChoice } from "../state/taskpromptstore";

export interface UseTaskPromptArgs {
  readonly operation: PromptOperation;
  readonly scope: PromptScope;
  readonly presets: readonly PromptPresetLike[];
  readonly mainPrompt: string;
  readonly legacyPresetName?: string;
}

export interface TaskPromptSelection {
  readonly resolved: ResolvedTaskPrompt;
  readonly select: (value: string) => void;
  readonly persistCurrent: () => void;
}

export function useTaskPromptSelection(args: UseTaskPromptArgs): TaskPromptSelection {
  const [stored, setStored] = useState<TaskPromptMap>(() => loadTaskPrompts());
  const taskId = taskIdOf(args.operation, args.scope);
  const resolved = resolveTaskPrompt({
    taskId,
    stored,
    presets: args.presets,
    mainPrompt: args.mainPrompt,
    legacyPresetName: args.legacyPresetName,
  });

  const select = useCallback((value: string) => {
    const choice = choiceFromSelectValue(value);
    if (!choice) return;
    setStored(saveTaskPromptChoice(taskId, choice));
  }, [taskId]);

  const persistCurrent = useCallback(() => {
    const choice = choiceFromSelectValue(resolved.selectValue);
    if (!choice) return;
    setStored(saveTaskPromptChoice(taskId, choice));
  }, [taskId, resolved.selectValue]);

  return { resolved, select, persistCurrent };
}

export interface TaskPromptPickerProps {
  readonly selection: TaskPromptSelection;
  readonly presets: readonly PromptPresetLike[];
  readonly selectTestId: string;
  readonly defaultMsgTestId: string;
  readonly label: string;
  readonly problemTestId?: string;
}

export function TaskPromptPicker(p: TaskPromptPickerProps) {
  const { resolved, select } = p.selection;
  return (
    <div className="svg-regen-prompt">
      <p className="svg-note strong task-default-prompt" role="status" data-testid={p.defaultMsgTestId}>
        {resolved.defaultMessage}
      </p>
      {!(resolved.requiresPreset && p.presets.length === 0) && (
        <PresetSelectField label={p.label} testId={p.selectTestId} resolved={resolved} presets={p.presets} onSelect={select} />
      )}
      {resolved.problem && (
        <p className="svg-confirm-note" role="alert" data-testid={p.problemTestId ?? "svg-regen-problem"}>
          {resolved.problem}
        </p>
      )}
    </div>
  );
}

function PresetSelectField(p: {
  label: string; testId: string; resolved: ResolvedTaskPrompt;
  presets: readonly PromptPresetLike[]; onSelect: (v: string) => void;
}) {
  return (
    <label className="svg-field svg-regen-field">
      <span>{p.label}</span>
      <select className="svg-select" value={p.resolved.selectValue} data-testid={p.testId} onChange={(e) => p.onSelect(e.target.value)}>
        {!p.resolved.requiresPreset && <option value={MAIN_PROMPT_VALUE}>Main editor prompt (currently loaded)</option>}
        {p.presets.map((pr) => <option key={pr.name} value={pr.name}>{pr.name}</option>)}
      </select>
    </label>
  );
}
