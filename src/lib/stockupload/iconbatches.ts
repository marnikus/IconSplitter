// iconbatches.ts — how a run walks a large selection: 100 icons per batch (a JPEG
// and its matching EPS are one icon), in the order the caller hands them over.
// The FTPS/SFTP sites keep that order — the number in front of every file name;
// only Getty web draws its batches at random, in its own planner.

/** Getty's own cap, which every chunked target now follows. */
export const ICONS_PER_BATCH = 100;

export interface IconBatchOptions {
  /** Icons one batch may hold; the real 100 unless a test injects one. */
  maxIcons?: number;
}

/** The indexes of one target, cut into batches of at most `maxIcons`, in order. */
export function planIconBatches(count: number, options: IconBatchOptions = {}): number[][] {
  const total = Math.max(0, Math.trunc(count));
  const size = Math.max(1, Math.floor(options.maxIcons ?? ICONS_PER_BATCH));
  const batches: number[][] = [];
  for (let at = 0; at < total; at += size) {
    const length = Math.min(size, total - at);
    batches.push(Array.from({ length }, (_none, offset) => at + offset));
  }
  return batches;
}
