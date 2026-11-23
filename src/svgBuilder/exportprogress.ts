// exportprogress.ts — in-memory state for SVG builder artboard export progress.
// Publishes live completed / remaining ("left") counts and current artboard to
// ProcessProgressBar via builderExportSlot; never persists or duplicates undo.
import { processTotals, type ProcessStatus } from "../lib/processprogress";
import { createProcessSlot, publishProcess } from "../lib/processslot";

export interface BuilderExportProcess {
  readonly runId: string;
  readonly done: number;
  readonly total: number;
  readonly status: ProcessStatus;
  readonly current: string;
  readonly problems: readonly string[];
  readonly cancelling: boolean;
}

export interface BuilderExportRun {
  readonly signal: AbortSignal;
  isCancelled(): boolean;
  startItem(name: string): void;
  advance(itemProblems: readonly string[]): void;
  finish(): void;
}

export const builderExportSlot = createProcessSlot<BuilderExportProcess>();

let seq = 0;
let activeAbort: AbortController | null = null;

function initialState(runId: string, total: number): BuilderExportProcess {
  return {
    runId,
    done: 0,
    total: Math.max(0, Math.floor(total)),
    status: "running",
    current: "Preparing SVG icons…",
    problems: [],
    cancelling: false,
  };
}

export function beginBuilderExport(total: number): BuilderExportRun {
  activeAbort?.abort();
  const controller = new AbortController();
  activeAbort = controller;
  seq += 1;
  let state = initialState(`builder-export-${seq}`, total);
  publishProcess(builderExportSlot, state);
  const update = (patch: Partial<BuilderExportProcess>): void => {
    if (state.status !== "running" || builderExportSlot.value?.runId !== state.runId) return;
    state = { ...state, ...patch };
    publishProcess(builderExportSlot, state);
  };
  return {
    signal: controller.signal,
    isCancelled: () => controller.signal.aborted,
    startItem: (current) => update({ current }),
    advance: (itemProblems) => update({ done: Math.min(state.total, state.done + 1), problems: [...state.problems, ...itemProblems] }),
    finish: () => {
      if (activeAbort === controller) activeAbort = null;
      const status: ProcessStatus = controller.signal.aborted ? "cancelled" : state.problems.length > 0 ? "failed" : "completed";
      update({ status, cancelling: false });
    },
  };
}

export function cancelBuilderExport(): void {
  const cur = builderExportSlot.value;
  if (cur?.status === "running" && !cur.cancelling) {
    publishProcess(builderExportSlot, { ...cur, cancelling: true });
  }
  activeAbort?.abort();
}

export function dismissBuilderExport(): void {
  if (builderExportSlot.value?.status === "running") return;
  publishProcess(builderExportSlot, null);
}

export function resetBuilderExport(): void {
  activeAbort?.abort();
  activeAbort = null;
  publishProcess(builderExportSlot, null);
}

export function builderExportCopy(p: BuilderExportProcess): { title: string; detail: string; totals: ReturnType<typeof processTotals> } {
  const totals = processTotals({ done: p.done, total: p.total });
  if (p.status === "running") {
    return {
      title: p.cancelling ? "Stopping artboard export…" : `Exporting artboards · ${totals.left} left`,
      detail: p.current,
      totals,
    };
  }
  if (p.status === "cancelled") {
    return { title: "Artboard export cancelled", detail: `${totals.done} of ${totals.total} artboard(s) exported · ${totals.left} left`, totals };
  }
  if (p.status === "failed") {
    return { title: "Artboard export finished with problems", detail: p.problems.join(" · "), totals };
  }
  return { title: "Artboard export complete", detail: `${totals.done} artboard(s) exported into _artboard_sheets`, totals };
}
