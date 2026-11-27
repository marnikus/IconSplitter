// bounded.ts — a disk step that may never answer (2026-11-27). A browser folder
// call can wait forever: a stalled drive, a sync client holding the file, a
// permission prompt the user never sees. Work that must end — a click's
// progress bar — gives each such step a time limit and names the step that
// stalled, instead of spinning without end.

/** A named step did not answer in time. */
export class StallError extends Error {
  constructor(readonly step: string, ms: number) {
    super(`${step} did not answer within ${Math.round(ms / 1000)} s`);
    this.name = "StallError";
  }
}

/** `work`, or a StallError naming `step` when it has not settled within `ms`. */
export function bounded<T>(step: string, work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StallError(step, ms)), ms);
  });
  return Promise.race([work, stall]).finally(() => clearTimeout(timer));
}

/** `work`'s value, or null when it fails or has not answered within `ms` (a read that may be skipped). */
export async function orNull<T>(work: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await bounded("read", work, ms);
  } catch {
    return null;
  }
}
