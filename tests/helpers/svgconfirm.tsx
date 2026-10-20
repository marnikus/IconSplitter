// svgconfirm.tsx — the confirmation's props built in ONE place (2026-10-20).
// The dialog now needs the six prompt tasks and the regen size; every suite that
// mounts it should say only what its case is about, not repeat six defaults.
import { capsFor, type SamplingParams } from "../../src/lib/modelcaps";
import { DEFAULT_CONFIG, type SvgConfig } from "../../src/lib/svgconfig";
import { DEFAULT_TASK_PROMPTS, type TaskPromptEntry, type PromptTaskId, type TaskPromptMap } from "../../src/lib/prompttasks";
import type { PromptPreset } from "../../src/lib/promptpresets";
import SvgConfirm, { type SvgConfirmProps } from "../../src/svg/SvgConfirm";
import type { ConfirmedBatch, SvgRow } from "../../src/svg/types";
import { FakeDir } from "./fakefs";

export interface ConfirmOpts {
  ids: string[];
  rows: SvgRow[];
  operation?: "generate" | "regenerate";
  presets?: PromptPreset[];
  prompt?: string;
  config?: Partial<SvgConfig>;
  regenSize?: number;
  regenSizeWarning?: boolean;
  taskEntries?: Partial<TaskPromptMap>;
  running?: boolean;
  onConfirm?: (batch: ConfirmedBatch) => void;
  onDismiss?: () => void;
  onTaskEntry?: (task: PromptTaskId, entry: TaskPromptEntry) => void;
  onRegenSize?: (count: number) => void;
  root?: FakeDir;
}

const PARAMS: SamplingParams = { temperature: null, maxTokens: 8_000, effort: null };

/** Every prop the dialog takes, with the documented defaults filled in. */
export function confirmProps(o: ConfirmOpts): SvgConfirmProps {
  return {
    ids: o.ids,
    operation: o.operation ?? "generate",
    rows: o.rows,
    config: { ...DEFAULT_CONFIG, ...o.config },
    caps: capsFor(DEFAULT_CONFIG.model),
    params: PARAMS,
    rootRef: { current: o.root ?? new FakeDir("split_root") },
    running: o.running ?? false,
    presets: o.presets ?? [],
    prompt: o.prompt ?? "main prompt",
    regenSize: o.regenSize ?? 9,
    regenSizeWarning: o.regenSizeWarning ?? false,
    taskEntries: { ...DEFAULT_TASK_PROMPTS, ...o.taskEntries },
    onTaskEntry: o.onTaskEntry ?? (() => undefined),
    onRegenSize: o.onRegenSize ?? (() => undefined),
    onConfirm: o.onConfirm ?? (() => undefined),
    onDismiss: o.onDismiss ?? (() => undefined),
  };
}

export function confirmElement(o: ConfirmOpts) {
  return <SvgConfirm {...confirmProps(o)} />;
}
