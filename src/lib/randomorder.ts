// randomorder.ts — the shared Fisher–Yates draw order (moved out of
// lib/stockupload/gettyweb.ts so selection and upload batching use ONE shuffle).
// `rng` is injectable for tests; production uses Math.random.

/** A random permutation of `0..count-1`; every index appears exactly once. */
export function randomBatchOrder(count: number, rng: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(0, Math.trunc(count)) }, (_value, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const pick = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [order[i], order[pick]] = [order[pick], order[i]];
  }
  return order;
}
