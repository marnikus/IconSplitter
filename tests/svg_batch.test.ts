// svg_batch.test.ts — the batch planner's new guarantees (RULE 8): a selection
// is split into as many requests as its size really needs, every batch is
// valid before anything is sent, and every request's outcome is recorded with
// its own tokens and cost. Each assertion fails if the corresponding function
// in src/lib/svgbatch.ts is deleted.
import { describe, expect, it } from "vitest";
import {
  batchOutcome, emptyPositions, planBatches, requestCount, validateBatchPlan,
  type BatchPlan, type BatchSource,
} from "../src/lib/svgbatch";
import { NO_USAGE } from "../src/lib/svgrequest";

/** `n` approved sources in scan order — ids are the stable pair ids. */
function sources(n: number): BatchSource[] {
  return Array.from({ length: n }, (_, i) => ({
    sourceId: `pair_${i + 1}`,
    name: `icon-${i + 1}_AI`,
    relPath: `architecture/icon-${i + 1}_AI.png`,
    fingerprint: `${i + 1}:100`,
  }));
}

describe("planBatches — every selection size the report asks about", () => {
  it.each([
    [1, [1]],
    [3, [3]],
    [4, [4]],
    [5, [4, 1]],
    [8, [4, 4]],
    [9, [4, 4, 1]],
    [11, [4, 4, 3]],
    [23, [4, 4, 4, 4, 4, 3]],
  ])("%i images at 4 per request -> %j images per request", (count, sizes) => {
    const plans = planBatches(sources(count), 4);
    expect(plans.map((p) => p.items.length)).toEqual(sizes);
    expect(plans.map((p) => p.id)).toEqual(sizes.map((n, i) => `batch_${i + 1}_${n}`));
    // positions restart at 1 in every request and never skip
    for (const plan of plans) {
      expect(plan.items.map((i) => i.position)).toEqual(plan.items.map((_, i) => i + 1));
    }
    // no image is lost or duplicated, and the order is the scan order
    expect(plans.flatMap((p) => p.items.map((i) => i.sourceId))).toEqual(sources(count).map((s) => s.sourceId));
  });

  it("keeps the last partial batch's empty grid cells (3 -> 2x2 with one empty)", () => {
    const plans = planBatches(sources(3), 4);
    expect(plans).toHaveLength(1);
    expect(plans[0].cols).toBe(2);
    expect(plans[0].rows).toBe(2);
    expect(plans[0].emptyCells).toBe(1);
    expect(emptyPositions(plans[0])).toEqual([4]);
    // the trailing batch of 11 images is a 2x2 grid holding 3: one empty cell
    const last = planBatches(sources(11), 4)[2];
    expect(last.items).toHaveLength(3);
    expect(last.emptyCells).toBe(1);
    expect(emptyPositions(last)).toEqual([4]);
  });

  it("honours every configured size from 1 to 9 on a nine-image selection", () => {
    // The prompt's verify list: every batch size the input allows. The plan
    // must never exceed the requested size, must cover all nine images, and
    // its request count must match requestCount().
    for (let per = 1; per <= 9; per += 1) {
      const plans = planBatches(sources(9), per);
      expect(plans).toHaveLength(Math.ceil(9 / per));
      expect(plans.every((p) => p.items.length <= per)).toBe(true);
      expect(plans.flatMap((p) => p.items)).toHaveLength(9);
      expect(requestCount(9, per)).toBe(plans.length);
      // the last batch keeps a square grid with the cells it did not fill
      const last = plans[plans.length - 1];
      expect(last.cols * last.rows).toBeGreaterThanOrEqual(last.items.length);
      expect(last.emptyCells).toBe(last.cols * last.rows - last.items.length);
    }
  });

  it("never exceeds the per-request size even when asked for more", () => {
    expect(planBatches(sources(5), 99).map((p) => p.items.length)).toEqual([5]);
    expect(planBatches([], 4)).toEqual([]);
  });
});

describe("requestCount — the number the user is shown before sending", () => {
  it("is the ceiling of images / per request", () => {
    expect(requestCount(0, 4)).toBe(0);
    expect(requestCount(1, 4)).toBe(1);
    expect(requestCount(4, 4)).toBe(1);
    expect(requestCount(5, 4)).toBe(2);
    expect(requestCount(8, 2)).toBe(4);
    expect(requestCount(9, 1)).toBe(9);
  });
});

describe("validateBatchPlan — fail closed before any request is sent", () => {
  it("accepts every real plan it is given", () => {
    for (const count of [1, 3, 4, 5, 8, 9, 11, 23]) {
      const plans = planBatches(sources(count), 4);
      expect(validateBatchPlan(plans, 4)).toEqual([]);
    }
  });

  it("rejects a batch that is over the per-request cap", () => {
    const plan: BatchPlan = {
      id: "batch_1_4", cols: 2, rows: 2, emptyCells: 0,
      items: sources(4).map((s, i) => ({ ...s, position: i + 1 })),
    };
    const problems = validateBatchPlan([plan], 2);
    expect(problems.join(" ")).toContain("4");
    expect(problems.join(" ")).toContain("2");
  });

  it("rejects positions that do not run 1..n and a broken empty-cell count", () => {
    const plan: BatchPlan = {
      id: "batch_1_2", cols: 2, rows: 2, emptyCells: 5,
      items: [{ ...sources(1)[0], position: 2 }, { ...sources(1)[0], position: 1 }],
    };
    const problems = validateBatchPlan([plan], 4);
    expect(problems.some((p) => p.includes("position"))).toBe(true);
    expect(problems.some((p) => p.includes("empty"))).toBe(true);
  });
});

describe("batchOutcome — status, tokens and cost per request", () => {
  const plan = planBatches(sources(4), 4)[0];

  it("records a finished request with its tokens and reported cost", () => {
    const usage = { input: 100, output: 200, total: 300, cost: 0.02, currency: "USD" };
    const out = batchOutcome({ plan, index: 1, model: "openai/gpt-6.1-sol", saved: 4, failed: 0, missing: 0, usage, error: null });
    expect(out).toMatchObject({ id: plan.id, index: 1, count: 4, status: "done", saved: 4, failed: 0, missing: 0 });
    expect(out.usage.total).toBe(300);
    expect(out.cost.actual).toBe(0.02);
    expect(out.cost.basis).toBe("provider");
  });

  it("marks a request that failed as failed, with no saved files", () => {
    const out = batchOutcome({ plan, index: 2, model: "openai/gpt-6.1-sol", saved: 0, failed: 4, missing: 0, usage: NO_USAGE, error: "500 boom" });
    expect(out.status).toBe("failed");
    expect(out.error).toBe("500 boom");
    expect(out.cost.basis).toBe("none");
  });

  it("keeps a partial answer a done request with missing positions counted", () => {
    const out = batchOutcome({ plan, index: 3, model: "openai/gpt-6.1-sol", saved: 3, failed: 0, missing: 1, usage: NO_USAGE, error: null });
    expect(out.status).toBe("done");
    expect(out.missing).toBe(1);
  });
});
