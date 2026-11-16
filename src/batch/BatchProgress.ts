// BatchProgress.ts — persistent progress model for batch split (reuses SVG progress pattern)
// Pure arithmetic, no React, testable (RULE 3)

import { processTotals, type ProcessStatus } from "../lib/processprogress";

export interface BatchProgress {
  runId: string;
  startedAt: number;
  total: number;
  done: number;
  currentRelPath: string | null;
  currentName: string;
  saved: number;
  failed: number;
  skipped: number;
}

export interface BatchTotals {
  done: number;
  left: number;
  percent: number;
  images: number;
}

export function batchTotals(p: BatchProgress | null): BatchTotals {
  const { done, left, percent, total } = processTotals(p);
  return { done, left, percent, images: total };
}

export function makeBatchProgress(total: number, runId: string): BatchProgress {
  return {
    runId,
    startedAt: Date.now(),
    total,
    done: 0,
    currentRelPath: null,
    currentName: "",
    saved: 0,
    failed: 0,
    skipped: 0,
  };
}

/**
 * The bar's lifecycle state (2026-11-03): a run that stopped before every file
 * was processed was cancelled; one that processed everything but failed some
 * files ended with errors.
 */
export function batchStatusOf(p: BatchProgress, running: boolean): ProcessStatus {
  if (running) return "running";
  if (p.done < p.total) return "cancelled";
  return p.failed > 0 ? "failed" : "completed";
}
