// limiter.ts — at most N file-system operations in flight (2026-11-06). The
// File System Access API answers each listing / open with real latency (a
// cloud-synced folder most of all); doing them strictly one at a time is what
// made a 1000-pair scan slow. A bounded pool keeps the drive busy without
// flooding it, and results keep the caller's order.

export type Limiter = <T>(work: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  const size = Math.max(1, Math.floor(max));
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await work();
    } finally {
      next();
    }
  };
}

/** `fn` over every item with at most `max` running; results in item order. */
export function mapLimited<T, R>(items: readonly T[], max: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const limit = createLimiter(max);
  return Promise.all(items.map((item) => limit(() => fn(item))));
}
