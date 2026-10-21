// BatchProgress.ts — persistent progress model for batch split (reuses SVG progress pattern)
// Pure arithmetic, no React, testable (RULE 3)

import { processTotals } from "../lib/processprogress";

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
