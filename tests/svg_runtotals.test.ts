// svg_runtotals.test.ts — the ONE arithmetic behind "N done · M left"
// (2026-10-08): the popup on every tab, the bulk bar and the log all read it,
// so they can never disagree. Proven on plain data: mid-request, between
// requests, with batches waiting behind the run, after the run ended, and when
// nothing has ever run.
import { describe, expect, it } from "vitest";
import { NO_CHAIN, chainAdd, runTotals, totalsLine, withChain } from "../src/svg/runtotals";
import { queueItem } from "../src/svg/runqueue";
import type { RunProgress } from "../src/svg/types";
import type { BatchOutcome } from "../src/lib/svgbatch";

const USAGE = { input: 0, output: 0, total: 0, cost: null, currency: "USD" };
const COST = { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" as const };
function outcome(index: number, over: Partial<BatchOutcome> = {}): BatchOutcome {
  return { id: `b${index}`, index, count: 4, status: "done", saved: 4, failed: 0, missing: 0, usage: USAGE, cost: COST, error: null, requestId: null, elapsedMs: 10, ...over };
}
function progress(over: Partial<RunProgress> = {}): RunProgress {
  return {
    batchId: "b2", index: 2, batches: 5, count: 4, cols: 2, rows: 2, composite: "data:,", hash: "h",
    runId: "run_1", saved: 0, failed: 0, missing: 0, startedAt: 0, perRequest: 4, images: 20, outcomes: [outcome(1)], ...over,
  };
}

describe("runTotals", () => {
  it("nothing ever ran: all zeros, no request", () => {
    expect(runTotals(null, [])).toEqual({ done: 0, left: 0, failed: 0, images: 0, queued: 0, request: 0, requests: 0 });
  });

  it("mid-request: the finished requests plus this request's own counters so far", () => {
    const t = runTotals(progress({ saved: 2, failed: 1 }), []);
    expect(t).toMatchObject({ done: 7, left: 13, failed: 1, images: 20, queued: 0, request: 2, requests: 5 });
  });

  it("between requests: exactly the finished requests", () => {
    expect(runTotals(progress(), []).done).toBe(4);
  });

  it("missing images count as not saved — in `failed` for the user's eye", () => {
    const t = runTotals(progress({ outcomes: [outcome(1, { saved: 2, failed: 1, missing: 1 })] }), []);
    expect(t.done).toBe(4);
    expect(t.failed).toBe(2);
  });

  it("batches waiting behind the run are LEFT too", () => {
    const waiting = [queueItem(["x", "y"], 1, "x"), queueItem(["z"], 1, "z")];
    const t = runTotals(progress(), waiting);
    expect(t.queued).toBe(3);
    expect(t.left).toBe(16 + 3);
  });

  it("after the run ended: done equals the run's images, left is only what waits", () => {
    const ended = progress({ index: 5, outcomes: [1, 2, 3, 4, 5].map((i) => outcome(i)) });
    expect(runTotals(ended, [])).toMatchObject({ done: 20, left: 0 });
    expect(runTotals(ended, [queueItem(["q"], 1, "q")]).left).toBe(1);
  });

  it("never reports more done than the run has images (a request's counters cannot overshoot)", () => {
    expect(runTotals(progress({ saved: 99, images: 8, outcomes: [outcome(1)] }), []).done).toBe(8);
  });
});

describe("totalsLine — what the popup and the log say", () => {
  it("running: done · left · request n of m", () => {
    expect(totalsLine(runTotals(progress({ saved: 2, failed: 1 }), []), true)).toBe("Generating · 7 done · 13 left · 1 failed · request 2 of 5");
  });
  it("idle after a run: Done, no request part, failed only when there were any", () => {
    const ended = progress({ index: 5, outcomes: [1, 2, 3, 4, 5].map((i) => outcome(i)) });
    expect(totalsLine(runTotals(ended, []), false)).toBe("Done · 20 done · 0 left");
  });
});

describe("the chain — one count across the runs a queue produced", () => {
  const ended = progress({ index: 5, outcomes: [1, 2, 3, 4, 5].map((i) => outcome(i, { failed: 1, saved: 3 })) });

  it("folds a finished run's outcomes in, and the next run reads done and failed on top of its own", () => {
    const chain = chainAdd(NO_CHAIN, ended.outcomes);
    expect(chain).toEqual({ done: 20, failed: 5 });
    const next = progress({ batchId: "n1", index: 1, batches: 1, images: 1, outcomes: [] });
    const shown = withChain(runTotals(next, []), chain);
    expect(shown).toMatchObject({ done: 20, failed: 5, left: 1, request: 1, requests: 1 });
    expect(totalsLine(shown, true)).toBe("Generating · 20 done · 1 left · 5 failed · request 1 of 1");
    const landed = { ...next, outcomes: [outcome(1, { id: "n1", count: 1, saved: 1 })] };
    expect(totalsLine(withChain(runTotals(landed, []), chain), false)).toBe("Done · 21 done · 0 left · 5 failed");
  });

  it("missing images are counted done AND failed, like everywhere else", () => {
    expect(chainAdd(NO_CHAIN, [outcome(1, { saved: 2, failed: 1, missing: 1 })])).toEqual({ done: 4, failed: 2 });
    expect(chainAdd({ done: 1, failed: 1 }, [])).toEqual({ done: 1, failed: 1 });
  });
});
