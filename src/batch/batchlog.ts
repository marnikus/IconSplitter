// batchlog.ts — what batch processing tells the global log (SOR §13): the
// start, the outcome and the user's stop. Facts only: counts, never paths.

import { logger } from "../log/logger";

export interface ProcessCounts { done: number; skipped: number; failed: number }

const batch = logger("batch");

export function logProcessStart(selected: number): void {
  batch.info("process.start", `Splitting ${selected} image(s)`, { data: { selected } });
}

export function logProcessDone(c: ProcessCounts, stopped: boolean): void {
  const level = c.failed > 0 || stopped ? "warn" : "info";
  batch[level]("process.done", `Split run finished: ${c.done} saved, ${c.skipped} skipped, ${c.failed} failed`,
    { data: { saved: c.done, skipped: c.skipped, failed: c.failed } });
}

export function logProcessStop(): void {
  batch.warn("process.stop", "Stop requested — finished items are kept");
}
