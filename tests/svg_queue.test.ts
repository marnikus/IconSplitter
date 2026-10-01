import { describe, expect, it, vi } from "vitest";
import { runQueue, type QueueProgress } from "../src/svg/run/queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("bounded generation queue", () => {
  it("respects concurrency, isolates failures, reports progress and preserves result order", async () => {
    const progress: QueueProgress[] = [];
    const seen: number[] = [];
    const result = await runQueue<number, number | string>({
      batches: [0, 1, 2, 3], concurrency: 2, continueWork: () => true,
      run: async (batch) => { seen.push(batch); if (batch === 1) throw new Error("item failed"); return batch * 10; },
      onFailure: (batch, _index, error) => `safe-${batch}-${(error as Error).message}`,
      onProgress: (value) => progress.push(value),
    });
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(result.results).toEqual([
      { index: 0, value: 0 }, { index: 1, value: "safe-1-item failed" },
      { index: 2, value: 20 }, { index: 3, value: 30 },
    ]);
    expect(result.cancelled).toBe(0);
    expect(progress.at(-1)).toMatchObject({ started: 4, completed: 4, active: 0, total: 4, currentIndexes: [] });
  });

  it("stops starting batches on cancellation but retains in-flight results", async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>(), deferred<string>()];
    let allow = true;
    let started = 0;
    let signalStarted!: () => void;
    const bothStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
    const work = runQueue({
      batches: [0, 1, 2, 3], concurrency: 2, continueWork: () => allow,
      run: async (batch) => { started++; if (started === 2) signalStarted(); return gates[batch].promise; },
      onFailure: (_batch, _index, error) => String(error), onProgress: vi.fn(),
    });
    await bothStarted;
    allow = false;
    gates[0].resolve("finished-0"); gates[1].resolve("finished-1");
    const result = await work;
    expect(started).toBe(2);
    expect(result.results).toEqual([{ index: 0, value: "finished-0" }, { index: 1, value: "finished-1" }]);
    expect(result.cancelled).toBe(2);
  });

  it("clamps concurrency to the maximum four workers", async () => {
    let active = 0;
    let maximum = 0;
    await runQueue({
      batches: Array.from({ length: 8 }, (_, index) => index), concurrency: 99, continueWork: () => true,
      run: async (item) => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return item; },
      onFailure: () => -1, onProgress: vi.fn(),
    });
    expect(maximum).toBeLessThanOrEqual(4);
    expect(maximum).toBeGreaterThan(1);
  });
});
