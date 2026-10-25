// quiet.ts — "settle until the app is quiet" for DOM tests (TEST_HARNESS.md §3).
// A fixed `sleep(1200)` after a click waits the worst case on every run. This
// helper waits only while the app still has work queued: a pending
// setImmediate (fake-indexeddb, React's scheduler) or a timer due inside the
// caller's window. The old fixed duration stays the upper bound, so a settle
// is never longer than before and a timer due after the window (a 4 s toast)
// is ignored exactly as the fixed sleep ignored it. Installed once per DOM
// test file by tests/setup/harness.ts, before any app module captures the timers.
import { act } from "react";

type Handle = unknown;
type Pending = { due: number; fire: () => void };
const timers = new Map<Handle, Pending>(); // handle -> virtual due time + early-fire hook
let immediates = 0;
let installed = false;
let warp = 0; // ms of app time already fast-forwarded by settle()/waitUntil()
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realSetImmediate = typeof setImmediate === "function" ? setImmediate : (fn: () => void) => realSetTimeout(fn, 0);
const realNow = () => Date.now();
const now = () => realNow() + warp;

function key(handle: Handle): Handle {
  return typeof handle === "object" && handle !== null && Symbol.toPrimitive in handle ? Number(handle) : handle;
}

function wrapTimeout(g: typeof globalThis): void {
  const set = g.setTimeout.bind(g);
  const clear = g.clearTimeout.bind(g);
  g.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    const run = () => { timers.delete(key(h)); fn(...rest); };
    const h = set(run, ms);
    timers.set(key(h), { due: now() + Math.max(0, Number(ms) || 0), fire: () => { clear(h); run(); } });
    return h;
  }) as typeof g.setTimeout;
  g.clearTimeout = ((h?: Parameters<typeof clearTimeout>[0]) => { timers.delete(key(h)); clear(h); }) as typeof g.clearTimeout;
}

function wrapImmediate(g: typeof globalThis): void {
  if (typeof g.setImmediate !== "function") return;
  const set = g.setImmediate.bind(g);
  const clear = g.clearImmediate.bind(g);
  const live = new Set<Handle>();
  g.setImmediate = ((fn: (...a: unknown[]) => void, ...rest: unknown[]) => {
    immediates += 1;
    const h = set((...a: unknown[]) => { if (live.delete(h)) immediates -= 1; fn(...a); }, ...rest);
    live.add(h);
    return h;
  }) as typeof g.setImmediate;
  g.clearImmediate = ((h: NodeJS.Immediate) => { if (live.delete(h)) immediates -= 1; clear(h); }) as typeof g.clearImmediate;
}

/** Wraps the global timers once; app modules imported later capture the wrappers. */
export function installQuietTracking(): void {
  if (installed) return;
  installed = true;
  wrapTimeout(globalThis);
  wrapImmediate(globalThis);
}

/** The earliest timer due by `deadline` (virtual ms), if any. */
function nextTimer(deadline: number): Pending | undefined {
  let next: Pending | undefined;
  for (const t of timers.values()) if (t.due <= deadline && (next === undefined || t.due < next.due)) next = t;
  return next;
}

/**
 * One step of app time inside act(). Queued immediates (IndexedDB, React's
 * scheduler) run first. When the app is otherwise idle and only a timer due
 * inside the window remains, the clock jumps to it and it fires now — what a
 * fixed sleep would have done, minus the wall-clock wait. Returns false when
 * nothing was left to run.
 */
async function step(deadline: number): Promise<boolean> {
  const timer = immediates === 0 ? nextTimer(deadline) : undefined;
  const work = immediates > 0 || timer !== undefined;
  await act(async () => {
    if (timer !== undefined) {
      warp += Math.max(0, timer.due - now());
      timer.fire();
    }
    await new Promise<void>((r) => realSetImmediate(r));
  });
  return work;
}

/**
 * Runs the app until it is quiet for three turns, fast-forwarding timers due
 * within `maxMs`. Drop-in for `act(() => sleep(maxMs))`: everything that sleep
 * would have let happen still happens, in milliseconds instead of `maxMs`.
 */
export async function settle(maxMs = 80): Promise<void> {
  const deadline = now() + maxMs;
  // Never longer than the fixed sleep it replaces (a busy app — 1000 rows still
  // previewing — would otherwise keep a short settle stepping); the floor only
  // lets a zero-window settle finish its few turns on a loaded machine.
  const stopAt = realNow() + Math.max(maxMs, 250);
  let calm = 0;
  while (calm < 3 && realNow() < stopAt) calm = (await step(deadline)) ? 0 : calm + 1;
}

/** Steps the app (as settle does) until `pred` holds; fails after `budgetMs` of app time. */
export async function waitUntil(pred: () => boolean, what: string, budgetMs = 4000): Promise<void> {
  const deadline = now() + budgetMs;
  const stopAt = realNow() + Math.max(budgetMs, 2000);
  while (!pred() && now() < deadline && realNow() < stopAt) {
    // Readiness may already be queued in a Promise/React commit. Observe that
    // work before selecting a future timer (otherwise a toast can expire first).
    await act(async () => { await new Promise<void>((r) => realSetImmediate(r)); });
    if (pred()) return;
    if (!(await step(deadline))) await act(async () => { await new Promise((r) => realSetTimeout(r, 1)); });
  }
  if (!pred()) throw new Error(`never reached: ${what}`);
}
