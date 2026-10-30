// iconbatches.ts — how a run walks a large selection: the same rhythm every target
// keeps, 100 icons per batch (a JPEG and its matching EPS are one icon), each batch
// drawn from what is left when **Random batches** is on, and mixed inside itself so
// look-alikes do not queue up together.

import { randomBatchOrder, similarityKeyOf, spreadSimilar } from "./gettyweb";

/** Getty's own cap, which every chunked target now follows. */
export const ICONS_PER_BATCH = 100;

export interface IconBatchOptions {
  /** Icons one batch may hold; the real 100 unless a test injects one. */
  maxIcons?: number;
  /** Draw each batch from the icons not yet sent, and mix it inside itself. */
  randomize?: boolean;
  /** The draw's source of randomness; `Math.random` unless a test injects one. */
  rng?: () => number;
  /** What makes two icons of a batch look alike, so they can be pushed apart. */
  nameOf?: (index: number) => string;
}

/** A drawn batch is mixed again inside itself, look-alikes pushed apart. */
function mixBatch(chunk: readonly number[], keyOf: (index: number) => string, rng?: () => number): number[] {
  const mixed = randomBatchOrder(chunk.length, rng).map((slot) => chunk[slot]);
  return spreadSimilar(mixed, keyOf);
}

/** The batches of one target, as icon indexes: membership, then inner order. */
export function planIconBatches(count: number, options: IconBatchOptions = {}): number[][] {
  const total = Math.max(0, Math.trunc(count));
  const size = Math.max(1, Math.floor(options.maxIcons ?? ICONS_PER_BATCH));
  const randomized = options.randomize === true;
  const order = randomized ? randomBatchOrder(total, options.rng) : Array.from({ length: total }, (_none, index) => index);
  const keyOf = (index: number) => similarityKeyOf(options.nameOf?.(index) ?? "");
  const batches: number[][] = [];
  for (let at = 0; at < order.length; at += size) {
    const chunk = order.slice(at, at + size);
    batches.push(randomized ? mixBatch(chunk, keyOf, options.rng) : chunk);
  }
  return batches;
}
