// @vitest-environment node
// Canary for tests/helpers/virtualclock.ts: a bridge helper's real polling waits
// must resolve in virtual time, and the helper must refuse to pretend when the
// wait is not a timer.
import { afterEach, describe, expect, it } from "vitest";
import { installVirtualClock, restoreRealClock, settleVirtual } from "./helpers/virtualclock";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("virtual clock", () => {
  afterEach(restoreRealClock);

  it("finishes the bridge's fixed waits in virtual time instead of sleeping the worker", async () => {
    installVirtualClock();
    const startedAt = Date.now();
    const wallStarted = performance.now();
    let polls = 0;
    const work = (async () => {
      // The shape of tools/bridge/gettyweb/contribute.mjs: a bulk-save settle,
      // then upload/editor polls until the page reports the state.
      await sleep(1500);
      while (polls < 3) {
        polls += 1;
        await sleep(1000);
      }
      return { polls, at: Date.now() };
    })();

    const done = await settleVirtual(work);

    expect(done.polls).toBe(3);
    // Virtual time (and Date) moved by the full 4.5s the helper waited ...
    expect(done.at - startedAt).toBeGreaterThanOrEqual(4500);
    // ... while real time did not: no worker is blocked for those 4.5s.
    expect(performance.now() - wallStarted).toBeLessThan(4000);
  });

  it("fails loudly instead of hanging when the work is not timer-driven", async () => {
    installVirtualClock();
    await expect(settleVirtual(new Promise<never>(() => undefined), 1000, 3))
      .rejects.toThrow(/did not settle/);
  });

  it("restores an honest real clock afterwards", async () => {
    installVirtualClock();
    const virtualNow = Date.now();
    await settleVirtual(sleep(2000));
    expect(Date.now()).toBeGreaterThan(virtualNow + 1000);
    restoreRealClock();
    const realNow = Date.now();
    const started = performance.now();
    await sleep(60);
    expect(performance.now() - started).toBeGreaterThanOrEqual(50);
    expect(Date.now() - realNow).toBeGreaterThanOrEqual(50);
  });
});
