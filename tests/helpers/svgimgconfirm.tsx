// svgimgconfirm.tsx — the image-edit confirmation's props in ONE place
// (2026-10-20). The dialog now takes the six prompt tasks, so every suite that
// mounts it states only what its case is about.
import { DEFAULT_TASK_PROMPTS, type TaskPromptEntry, type PromptTaskId, type TaskPromptMap } from "../../src/lib/prompttasks";
import { DEFAULT_IMAGE_CONNECTION, type Connection } from "../../src/lib/svgconnections";
import type { PromptPreset } from "../../src/lib/promptpresets";
import SvgImgConfirm, { type SvgImgConfirmProps } from "../../src/svg/SvgImgConfirm";
import type { PreparedImageRun } from "../../src/svg/imgprepare";
import type { SvgRow } from "../../src/svg/types";
import { FakeDir } from "./fakefs";

export interface ImgConfirmOpts {
  ids: string[];
  rows?: SvgRow[];
  conn?: Connection;
  presets?: PromptPreset[];
  prompt?: string;
  taskEntries?: Partial<TaskPromptMap>;
  waitMs?: number;
  root?: FakeDir;
  onPrompt?: (prompt: string) => void;
  onConfirm?: (prepared: PreparedImageRun | null) => void;
  onCancel?: () => void;
  onTaskEntry?: (task: PromptTaskId, entry: TaskPromptEntry) => void;
}

/** Every prop the dialog takes, with the documented defaults filled in. */
export function imgConfirmProps(o: ImgConfirmOpts): SvgImgConfirmProps {
  return {
    ids: o.ids,
    rows: o.rows ?? [],
    rootRef: { current: o.root ?? new FakeDir("split_root") },
    conn: o.conn ?? DEFAULT_IMAGE_CONNECTION,
    presets: o.presets ?? [],
    prompt: o.prompt ?? "main prompt",
    taskEntries: { ...DEFAULT_TASK_PROMPTS, ...o.taskEntries },
    onTaskEntry: o.onTaskEntry ?? (() => undefined),
    onPrompt: o.onPrompt ?? (() => undefined),
    onConfirm: o.onConfirm ?? (() => undefined),
    onCancel: o.onCancel ?? (() => undefined),
    waitMs: o.waitMs,
  };
}

export function imgConfirmElement(o: ImgConfirmOpts) {
  return <SvgImgConfirm {...imgConfirmProps(o)} />;
}
