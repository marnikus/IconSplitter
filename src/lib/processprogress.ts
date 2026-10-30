// Generic, local batch progress. Settled items are not necessarily successful.
export type ProcessStatus = "running" | "completed" | "cancelled" | "failed";
export interface ProcessProgress {
  runId: string;
  done: number;
  total: number;
  status: ProcessStatus;
}
export interface ProcessReporter {
  advance: () => void;
  finish: (status: Exclude<ProcessStatus, "running">) => void;
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** The same bounds and percentage for every consumer; cancelled runs never fake 100%. */
export function processTotals(progress: { done: number; total: number } | null) {
  const total = count(progress?.total ?? 0);
  const done = Math.min(total, count(progress?.done ?? 0));
  return { done, total, left: total - done, percent: total > 0 ? Math.round(done / total * 100) : 0 };
}

/** One reporter per batch; immutable publications, unique identity, terminal once. */
export function createProcessReporter(total: number, publish: (progress: ProcessProgress) => void): ProcessReporter {
  let progress: ProcessProgress = { runId: crypto.randomUUID(), done: 0, total: count(total), status: "running" };
  publish(progress);
  return {
    advance: () => {
      if (progress.status !== "running") return;
      progress = { ...progress, done: Math.min(progress.total, progress.done + 1) };
      publish(progress);
    },
    finish: (status) => {
      if (progress.status !== "running") return;
      progress = { ...progress, status };
      publish(progress);
    },
  };
}
