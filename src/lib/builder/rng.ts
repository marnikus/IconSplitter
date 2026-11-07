// rng.ts — the sheet's only source of randomness, and it is not random at all.
//
// A preset plus a seed must reproduce a sheet exactly (design §5.3), so nothing
// here may call Math.random: the stream is derived from the seed alone, which also
// makes the result independent of how many times it is asked and of the order the
// caller happens to iterate in.
//
// The generator is mulberry32 — small, fast, and good enough for choosing which
// icon goes in a cell (it is not used for anything security-relevant).

/** A deterministic stream: the same seed always yields the same sequence. */
export function streamOf(seed: number): () => number {
  const start = normalizeSeed(seed);
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An index in [0, length) for this seed; 0 for an empty or 1-length input. */
export function seededPick(length: number, seed: number): number {
  if (!Number.isFinite(length) || length <= 1) return 0;
  return Math.min(length - 1, Math.floor(streamOf(seed)() * length));
}

/**
 * Fisher–Yates from the seeded stream. The result is a copy: the caller's array is
 * never touched (a shuffled pool is derived data, not state).
 */
export function shuffleBySeed<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const next = streamOf(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seed that is always a positive 32-bit integer — 0 would be a valid stream but means "unset". */
function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed) || seed <= 0) return 1;
  return Math.floor(seed) % 0xffffffff || 1;
}
