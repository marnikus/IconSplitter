// removalprogress.ts — the process behind "Remove unsuccessful uploads"
// (2026-11-09): three counted steps — badges, history files, site statuses —
// for ONE stock. The bar names the stock while it runs and, when finished,
// says how many badges / history files were removed. In-memory presentation
// only; the removal itself is owned by rejectedremoval.ts.
import { createProcessSlot, publishProcess } from "../lib/processslot";
import type { ProcessStatus } from "../lib/processprogress";
import type { RejectedRemovalResult } from "./rejectedremoval";

export const REMOVAL_STEPS = 3;

export interface RemovalProcess {
  runId: string;
  stockName: string;
  done: number;
  total: number;
  status: ProcessStatus;
  /** What the running step is doing. */
  phase: string;
  /** Known once the removal ended well. */
  result: RejectedRemovalResult | null;
}

export const removalSlot = createProcessSlot<RemovalProcess>();

export interface RemovalRun {
  /** The next step starts: the previous ones are done. */
  step: (phase: string) => void;
  finish: (result: RejectedRemovalResult) => void;
  fail: () => void;
}

export function beginRemoval(stockName: string): RemovalRun {
  let state: RemovalProcess = {
    runId: crypto.randomUUID(), stockName, done: 0, total: REMOVAL_STEPS, status: "running", phase: "Removing badges", result: null,
  };
  const set = (next: Partial<RemovalProcess>) => {
    if (state.status !== "running") return;
    state = { ...state, ...next };
    publishProcess(removalSlot, state);
  };
  publishProcess(removalSlot, state);
  return {
    step: (phase) => set({ phase, done: Math.min(REMOVAL_STEPS - 1, state.done + 1) }),
    finish: (result) => set({ status: "completed", done: REMOVAL_STEPS, phase: "Done", result }),
    fail: () => set({ status: "failed", phase: "Removal failed" }),
  };
}

export function dismissRemoval(): void {
  publishProcess(removalSlot, null);
}

/** Title and detail of the bar: the stock first, then the counts. */
export function removalBarOf(p: RemovalProcess): { title: string; detail: string } {
  if (p.status === "running") return { title: `Removing rejected uploads · ${p.stockName}`, detail: p.phase };
  if (p.status === "failed" || p.result === null) return { title: `${p.stockName} · removal failed`, detail: p.phase };
  const r = p.result;
  const missing = r.unmatched.length > 0 ? ` · ${r.unmatched.length} name(s) not found` : "";
  return {
    title: `${p.stockName} · rejected uploads removed`,
    detail: `${r.badges} badge(s) removed · ${r.historyFiles} history file(s) removed · ${r.statuses} status(es) updated${missing}`,
  };
}
