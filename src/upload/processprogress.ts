// Upload adapters for the generic batch reporter. Each process owns its slot.
import { createProcessReporter, type ProcessProgress } from "../lib/processprogress";
import type { UploadCtx } from "./actions";

export type UploadProcessKind = "metadata" | "export";
export interface UploadProgressState {
  processes: Record<UploadProcessKind, ProcessProgress | null>;
  /** Compatibility summary for the existing toolbar, derived from running slots. */
  progress: { done: number; total: number } | null;
}
export interface ProcessUpdate {
  kind: UploadProcessKind;
  progress: ProcessProgress;
  start: boolean;
}

function progressState(processes: UploadProgressState["processes"]): UploadProgressState {
  const active = Object.values(processes).find((p) => p?.status === "running") ?? null;
  return { processes, progress: active };
}

/** Identity and terminal guards prevent a delayed old run overwriting a new one. */
export function applyProcessUpdate(state: UploadProgressState, update: ProcessUpdate): UploadProgressState {
  const current = state.processes[update.kind];
  if (!update.start && (current?.runId !== update.progress.runId || current.status !== "running")) return state;
  return progressState({ ...state.processes, [update.kind]: update.progress });
}

export function dismissProcess(state: UploadProgressState, kind: UploadProcessKind, runId: string): UploadProgressState {
  const current = state.processes[kind];
  if (current?.runId !== runId || current.status === "running") return state;
  return progressState({ ...state.processes, [kind]: null });
}

/** All runner publications take the same reducer path. Nothing is persisted or sent. */
export function startUploadProgress(c: UploadCtx, kind: UploadProcessKind, total: number) {
  let start = true;
  return createProcessReporter(total, (progress) => {
    c.dispatch({ type: "process", kind, progress, start });
    start = false;
  });
}
