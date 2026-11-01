// runbusy.ts — is the page in the middle of work a reload would destroy?
//
// An automatic reload after a rebuild must never land inside an upload, a batch
// run or a generation: those live in memory (staged bytes, queue order, retry
// timers) and a swap would silently lose them. Panels own their own "running"
// flag, so they report it here; the reload gate reads one number. React-free and
// idempotent — re-setting the same key on every render is safe.

const runs = new Set<string>();

/** `active` is a fact about the panel right now, not a toggle. */
export function markRunning(key: string, active: boolean): void {
  if (active) runs.add(key);
  else runs.delete(key);
}

/** How many panels say they are running something. */
export function runningCount(): number {
  return runs.size;
}

/** Which panels — for the log line, so a held reload is explainable. */
export function runningKeys(): string[] {
  return [...runs].sort();
}
