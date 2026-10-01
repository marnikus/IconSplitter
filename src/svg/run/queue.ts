// run/queue.ts — bounded independent batch workers. Cancellation prevents new
// work from starting; in-flight requests finish and their outputs are retained.

export interface QueueProgress {
  started: number;
  completed: number;
  active: number;
  total: number;
  currentIndexes: number[];
}

interface QueueInput<Batch, Result> {
  batches: Batch[];
  concurrency: number;
  run: (batch: Batch, index: number) => Promise<Result>;
  onFailure: (batch: Batch, index: number, error: unknown) => Result;
  continueWork: () => boolean;
  onProgress: (progress: QueueProgress) => void;
}

interface QueueResult<Result> {
  results: Array<{ index: number; value: Result }>;
  cancelled: number;
}

export async function runQueue<Batch, Result>(input: QueueInput<Batch, Result>): Promise<QueueResult<Result>> {
  const results: Array<{ index: number; value: Result }> = [];
  const progress: QueueProgress = { started: 0, completed: 0, active: 0, total: input.batches.length, currentIndexes: [] };
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(4, Math.floor(input.concurrency)));
  await Promise.all(Array.from({ length: workerCount }, () => work(input, progress, results, () => cursor++)));
  return { results: results.sort((a, b) => a.index - b.index), cancelled: input.batches.length - results.length };
}

async function work<Batch, Result>(
  input: QueueInput<Batch, Result>, progress: QueueProgress,
  results: Array<{ index: number; value: Result }>, take: () => number,
): Promise<void> {
  while (input.continueWork()) {
    const index = take();
    const batch = input.batches[index];
    if (batch === undefined) return;
    progress.started++;
    progress.active++;
    progress.currentIndexes = [...progress.currentIndexes, index];
    input.onProgress({ ...progress, currentIndexes: [...progress.currentIndexes] });
    const value = await runOne(input, batch, index);
    results.push({ index, value });
    progress.active--;
    progress.completed++;
    progress.currentIndexes = progress.currentIndexes.filter((active) => active !== index);
    input.onProgress({ ...progress, currentIndexes: [...progress.currentIndexes] });
  }
}

async function runOne<Batch, Result>(input: QueueInput<Batch, Result>, batch: Batch, index: number): Promise<Result> {
  try { return await input.run(batch, index); } catch (error) { return input.onFailure(batch, index, error); }
}
