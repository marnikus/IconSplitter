// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { installQuietTracking, waitUntil } from "./helpers/quiet";

// DOM files get this from tests/setup/dom.ts; installing it here exercises the
// fast-forward path in a node-realm file too.
installQuietTracking();

const handles: ReturnType<typeof setTimeout>[] = [];
afterEach(() => { for (const handle of handles.splice(0)) clearTimeout(handle); });
const later = (fn: () => void, ms: number) => { handles.push(setTimeout(fn, ms)); };

it('observes already-queued promise work before advancing to a future expiration', async () => {
  let ready = false, expired = false;
  later(() => { expired = true; }, 4000);
  void Promise.resolve().then(() => { ready = true; });
  await waitUntil(() => ready, 'queued promise');
  expect(ready).toBe(true);
  expect(expired).toBe(false);
});

it('observes a queued immediate before advancing to a future expiration', async () => {
  let ready = false, expired = false;
  later(() => { expired = true; }, 4000);
  setImmediate(() => { ready = true; });
  await waitUntil(() => ready, 'queued immediate');
  expect(expired).toBe(false);
});

it('still advances a required in-budget timer and does not fire a later timer', async () => {
  let ready = false, expired = false;
  later(() => { ready = true; }, 50);
  later(() => { expired = true; }, 4000);
  await waitUntil(() => ready, 'required timer', 100);
  expect(ready).toBe(true);
  expect(expired).toBe(false);
});

it('does not spend the app-time window on a single fast-forward', async () => {
  // A panel timer due at the window edge consumed the whole budget in one
  // step, so the wait gave up milliseconds later and reported
  // `never reached: upload rows` on the heaviest React files.
  let ready = false;
  later(() => { later(() => { ready = true; }, 1); }, 100);
  const started = Date.now();
  await waitUntil(() => ready, 'timer at the window edge', 100);
  expect(ready).toBe(true);
  expect(Date.now() - started).toBeLessThan(60); // fast-forwarded, not slept
});

it('retains the timeout failure and never fires a timer beyond the budget', async () => {
  let outside = false;
  later(() => { outside = true; }, 4000);
  await expect(waitUntil(() => false, 'impossible state', 5)).rejects.toThrow('never reached: impossible state');
  expect(outside).toBe(false);
});
