// uploadjobs.ts — bounded concurrency with real cancellation (RULE 10/14).
// Owns: the pool that runs one icon per worker, the Cancelled signal, and the
// rule that one icon's failure never stops or invalidates another's.
//
// Retry is here too, but only for the failures that are worth retrying: a
// provider reply we never received (the completion is unknown) is NOT retried
// here — the pipeline decides that, because re-sending a paid request is a
// spending decision, not a scheduling one.

export class Cancelled extends Error {
  constructor(message = "cancelled") {
    super(message);
    this.name = "Cancelled";
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof Cancelled || (error instanceof Error && error.name === "Cancelled");
}

export interface ItemOutcome<T> {
  item: T;
  ok: boolean;
  error: string | null;
}

export interface PoolResult<T> {
  done: T[];
  failed: ItemOutcome<T>[];
  cancelled: T[];
  /** True when the caller's signal was the reason the run stopped early. */
  aborted: boolean;
}

export interface PoolOptions<T> {
  limit: number;
  signal: AbortSignal;
  worker: (item: T, signal: AbortSignal) => Promise<void>;
}

/**
 * Runs `worker` over `items` with at most `limit` in flight. A worker that
 * throws is recorded against its item and the rest keep going; an abort stops
 * handing out new work at once, and the items never started are reported as
 * cancelled rather than failed — "we did not get to it" is not a failure.
 */
export async function runPool<T>(items: readonly T[], options: PoolOptions<T>): Promise<PoolResult<T>> {
  const { limit, signal, worker } = options;
  const done: number[] = [];
  const failedIndex: number[] = [];
  const failed: ItemOutcome<T>[] = [];
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => lane());
  await Promise.all(lanes);
  // Work that was never handed out is cancelled, not failed: "we did not get to
  // it" must not read as "it broke".
  const cancelled = items.filter((_, index) => !done.includes(index) && !failedIndex.includes(index));
  return { done: done.map((i) => items[i]), failed, cancelled, aborted: signal.aborted };

  async function lane(): Promise<void> {
    for (;;) {
      if (signal.aborted) return;
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index], signal);
        done.push(index);
      } catch (error) {
        if (isCancelled(error) || signal.aborted) continue; // stays in `cancelled`
        failedIndex.push(index);
        failed.push({ item: items[index], ok: false, error: describe(error) });
      }
    }
  }
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "unknown error";
}

/** Sleep that resolves early when the signal aborts — no dangling timers. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
  });
}

/** The abort an item raises when the run was cancelled under it. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Cancelled();
}
