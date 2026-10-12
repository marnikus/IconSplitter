// BatchProgress.ts — persistent progress model for batch split (reuses SVG progress pattern)
// Pure arithmetic, no React, testable (RULE 3)

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
  if (!p) return { done: 0, left: 0, percent: 0, images: 0 };
  const left = Math.max(0, p.total - p.done);
  const percent = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return { done: p.done, left, percent, images: p.total };
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
