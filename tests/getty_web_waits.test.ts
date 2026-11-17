// @vitest-environment node
// What the Getty web run is waiting for right now (2026-11-12): every retry
// timer of the helper says what it waits for, what comes next (a page reload, a
// re-save, a re-upload), which attempt that is and how long is left — and the
// user may skip it. The control is the one object the waiting loops share.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWaitControl } from "../tools/bridge/gettyweb/waits.mjs";
import { withWaitInfo } from "../tools/bridge/gettyweb/session.mjs";

const files = (endsAt: number, extra: Record<string, unknown> = {}) => ({
  kind: "files", reason: "Getty has listed 3 of 10 file(s) and nothing new has appeared",
  next: "reload the Getty page and attach the missing files", endsAt, attempt: 1, of: 2, skippable: true, ...extra,
});

describe("the wait control", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => vi.useRealTimers());

  it("is silent until a wait begins", () => {
    expect(createWaitControl().current()).toBeNull();
  });

  it("says what the run waits for, with the time left worked out when it is read", () => {
    const waits = createWaitControl();
    waits.begin(files(Date.now() + 30_000));
    expect(waits.current()).toEqual({
      wait: {
        kind: "files", reason: "Getty has listed 3 of 10 file(s) and nothing new has appeared",
        next: "reload the Getty page and attach the missing files", remainingMs: 30_000, attempt: 1, of: 2, skippable: true,
      },
    });
    vi.advanceTimersByTime(12_000);
    expect(waits.current()?.wait?.remainingMs).toBe(18_000);
    vi.advanceTimersByTime(60_000);
    expect(waits.current()?.wait?.remainingMs).toBe(0); // never negative
  });

  it("an action takes over: what it is doing is told and the wait is gone", () => {
    const waits = createWaitControl();
    waits.begin(files(Date.now() + 30_000));
    waits.act("Reloading the Getty page (reload 1 of 2)…");
    expect(waits.current()).toEqual({ activity: "Reloading the Getty page (reload 1 of 2)…" });
  });

  it("a new wait replaces the activity; end() clears everything", () => {
    const waits = createWaitControl();
    waits.act("Reloading…");
    waits.begin(files(Date.now() + 5_000));
    expect(waits.current()).not.toHaveProperty("activity");
    waits.end();
    expect(waits.current()).toBeNull();
  });

  it("skip works on a retry timer, once, and is taken by the loop that looks", () => {
    const waits = createWaitControl();
    waits.begin(files(Date.now() + 30_000));
    expect(waits.skip()).toBe(true);
    expect(waits.takeSkip()).toBe(true);
    expect(waits.takeSkip()).toBe(false);
  });

  it("a wait that is not a retry timer (a deadline) cannot be skipped", () => {
    const waits = createWaitControl();
    waits.begin(files(Date.now() + 30_000, { skippable: false, next: "report the files as failed" }));
    expect(waits.skip()).toBe(false);
    expect(waits.takeSkip()).toBe(false);
  });

  it("nothing to skip while nothing waits; an old skip never leaks into the next wait", () => {
    const waits = createWaitControl();
    expect(waits.skip()).toBe(false);
    waits.begin(files(Date.now() + 30_000));
    waits.skip();
    waits.end(); // the wait ended on its own before the loop looked
    waits.begin(files(Date.now() + 30_000));
    expect(waits.takeSkip()).toBe(false);
  });
});

describe("the progress reading carries the wait", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000); });
  afterEach(() => vi.useRealTimers());
  const base = { phase: "uploading", total: 10, uploaded: 3, failed: 0, listed: 3, reloads: 0 };

  it("merges the wait and the activity into the counts; counts alone stay as they were", () => {
    const waits = createWaitControl();
    expect(withWaitInfo(base, waits)).toEqual(base);
    waits.begin(files(Date.now() + 20_000));
    expect(withWaitInfo(base, waits)).toMatchObject({ ...base, wait: { kind: "files", remainingMs: 20_000, skippable: true } });
    waits.act("Reloading…");
    expect(withWaitInfo(base, waits)).toMatchObject({ ...base, activity: "Reloading…" });
    expect(withWaitInfo(base, waits)).not.toHaveProperty("wait");
  });

  it("no counts, no reading", () => {
    expect(withWaitInfo(null, createWaitControl())).toBeNull();
  });
});
