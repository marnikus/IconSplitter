// iconbatches.ts — how a run walks a large selection: the same rhythm every target
// keeps, 100 icons per batch (a JPEG and its matching EPS are one icon), each batch
// drawn from what is left when **Random batches** is on, and mixed inside itself so
// look-alikes do not queue up together.

import { randomBatchOrder, similarityKeyOf, spreadSimilar } from "./gettyweb";
import { stableOrder } from "./shufflenames";

/** Getty's own cap, which every chunked target now follows. */
export const ICONS_PER_BATCH = 100;

export interface IconBatchOptions {
  /** Icons one batch may hold; the real 100 unless a test injects one. */
  maxIcons?: number;
  /** Draw each batch from the icons not yet sent, and mix it inside itself. */
  randomize?: boolean;
  /** The draw's source of randomness; `Math.random` unless a test injects one. */
  rng?: () => number;
  /**
   * Draw by name instead of by chance: the same selection always gives the same
   * batches and the same order. A site that keeps the files needs it — a fresh
   * draw would upload a second copy under a different number.
   */
  stable?: boolean;
  /** What makes two icons of a batch look alike, so they can be pushed apart. */
  nameOf?: (index: number) => string;
}

/**
 * A drawn batch is mixed again inside itself, look-alikes pushed apart. A stable
 * draw is already in its own order, so it only gets the spread — calling the
 * shuffle with a missing `rng` would quietly fall back to `Math.random` and make
 * a "stable" run different every time.
 */
function mixBatch(chunk: readonly number[], keyOf: (index: number) => string, options: IconBatchOptions): number[] {
  if (options.stable === true) return spreadSimilar([...chunk], keyOf);
  return spreadSimilar(randomBatchOrder(chunk.length, options.rng).map((slot) => chunk[slot]), keyOf);
}

/** The same draw every run: the icons in the order their names hash to. */
function drawnOrder(count: number, options: IconBatchOptions): number[] {
  const plain = Array.from({ length: count }, (_none, index) => index);
  if (options.randomize !== true) return plain;
  if (options.stable === true) return stableOrder(namesOf(count, options));
  return randomBatchOrder(count, options.rng);
}

function namesOf(count: number, options: IconBatchOptions): string[] {
  return Array.from({ length: count }, (_none, index) => options.nameOf?.(index) ?? "");
}

/** The batches of one target, as icon indexes: membership, then inner order. */
export function planIconBatches(count: number, options: IconBatchOptions = {}): number[][] {
  const total = Math.max(0, Math.trunc(count));
  const size = Math.max(1, Math.floor(options.maxIcons ?? ICONS_PER_BATCH));
  const randomized = options.randomize === true;
  const order = drawnOrder(total, options);
  const keyOf = (index: number) => similarityKeyOf(options.nameOf?.(index) ?? "");
  const batches: number[][] = [];
  for (let at = 0; at < order.length; at += size) {
    const chunk = order.slice(at, at + size);
    batches.push(randomized ? mixBatch(chunk, keyOf, options) : chunk);
  }
  return batches;
}
