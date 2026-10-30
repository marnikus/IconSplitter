// virtualclock.ts — run code that sleeps on `setTimeout` without sleeping the worker.
//
// The Getty bridge helpers poll a real page: `BULK_SAVE_SETTLE_MS = 1500`,
// `UPLOAD_POLL_MS = 1000`, `CONFIRM_SETTLE_MS = 700`. Tests drive those same
// helpers against a recording CDP connection, so the waits are pure wall time:
// two files spent ~30s with an idle CPU (measured 2026-10-30), which is why the
// suite only used 1.4-1.5 of its 2 cores.
//
// `installVirtualClock()` fakes only the timers those helpers use (`setTimeout`,
// `clearTimeout`) plus `Date`, so a deadline computed as `Date.now() + timeout`
// advances in lockstep with the timers instead of spinning. Everything else —
// promises, microtasks, the DOM, `performance.now()` — stays real, so nothing
// that measures real elapsed time is fooled.
import { vi } from "vitest";

/** Virtual milliseconds advanced per step; larger than every bridge wait. */
export const VIRTUAL_STEP_MS = 2_000;

/** Installs the virtual clock for the current test; pair with `restoreRealClock`. */
export function installVirtualClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

/** Restores real timers and a real `Date`. */
export function restoreRealClock(): void {
  vi.useRealTimers();
}

/**
 * Drives `work` to completion by advancing virtual time, and returns its result.
 * Only for code whose waits are `setTimeout` poll/settle delays: it throws rather
 * than hang when the work depends on something the virtual clock cannot advance.
 */
export async function settleVirtual<T>(work: Promise<T>, stepMs = VIRTUAL_STEP_MS, maxSteps = 500): Promise<T> {
  let settled = false;
  const tracked = work.then(
    (value) => { settled = true; return value; },
    (error: unknown) => { settled = true; throw error; },
  );
  // The caller observes the rejection through `await` below; this only keeps the
  // interim rejection from surfacing as unhandled while timers are advanced.
  tracked.catch(() => undefined);
  for (let step = 0; step < maxSteps && !settled; step += 1) await vi.advanceTimersByTimeAsync(stepMs);
  if (!settled) throw new Error(`virtual clock did not settle after ${maxSteps * stepMs}ms of virtual time`);
  return tracked;
}
