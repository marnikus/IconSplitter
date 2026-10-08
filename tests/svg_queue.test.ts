// svg_queue.test.ts — the queue's own rules (I-53), proven without a DOM or a
// network: a confirmed batch APPENDS, only the head may start, a drop leaves the
// rest in order, a cancel empties it and reports how much it dropped, and a
// queued batch never becomes a row status (it is a scheduling fact, not a state
// of the file). Getting these wrong is what silently lost the user's added work.
import { describe, expect, it } from "vitest";
import {
  dropAll, dropQueued, enqueue, nextRun, queuedCount, queueItem, shiftQueue,
} from "../src/svg/runqueue";

const first = queueItem(["a"], 1, "fog_AI.png");
const second = queueItem(["b", "c"], 2, "court_AI.png + 1 more");

describe("the generation queue", () => {
  it("appends: new work waits behind what is already there, in order", () => {
    const queue = enqueue(enqueue([], first), second);
    expect(queue.map((i) => i.id)).toEqual([first.id, second.id]);
    expect(queuedCount(queue)).toBe(2);
  });

  it("starts the head only when nothing is in flight", () => {
    expect(nextRun([], false)).toBeNull();
    expect(nextRun([first], true)).toBeNull(); // a request is in flight: wait
    expect(nextRun([first], false)?.ids).toEqual(["a"]);
    // and the head is what it starts — never a later batch
    expect(nextRun([first, second], false)?.id).toBe(first.id);
  });

  it("takes the started batch off the queue without disturbing the rest", () => {
    const { head, rest } = shiftQueue([first, second]);
    expect(head?.id).toBe(first.id);
    expect(rest.map((i) => i.id)).toEqual([second.id]);
    expect(shiftQueue([]).head).toBeNull();
  });

  it("drops one queued batch by id, and ignores an unknown id", () => {
    expect(dropQueued([first, second], first.id).map((i) => i.id)).toEqual([second.id]);
    expect(dropQueued([first, second], "q-nope")).toHaveLength(2);
  });

  it("empties the queue on a cancel and says how many batches that was", () => {
    const { rest, dropped } = dropAll([first, second]);
    expect(rest).toEqual([]);
    expect(dropped).toBe(2);
    expect(dropAll([]).dropped).toBe(0);
  });

  it("names every batch uniquely and keeps the user's count and request size", () => {
    const again = queueItem(["b", "c"], 2, "court_AI.png + 1 more");
    expect(again.id).not.toBe(second.id); // a drop can name the exact batch
    expect(again.count).toBe(2);
    expect(again.requests).toBe(2); // the user's images-per-request, not a tier cap
    expect(again.label).toBe("court_AI.png + 1 more"); // the waiting list can name it
    expect(queueItem([], 0, "").requests).toBe(1); // never "zero requests"
  });
});

// ── Keep-alive plan, step 1 (2026-10-08 svg-queue-keepalive): a Regenerate goes
// to the FRONT, a regenerated source leaves every waiting batch, the queued set
// is what the list shows as "Next attempt", and the popup's counts come from one
// pure function.
import { dropIdFrom, enqueueFront, queuedIds } from "../src/svg/runqueue";
import { runTotals } from "../src/svg/runtotals";
import { NO_USAGE } from "../src/lib/svgrequest";
import { batchOutcome, planBatches } from "../src/lib/svgbatch";

const PLAN = planBatches([{ sourceId: "s", name: "x_AI", relPath: "x_AI.png", fingerprint: "1:1" }], 4)[0];
import type { RunProgress } from "../src/svg/types";

const resize = (ids: string[]) => ({ requests: ids.length, label: `${ids[0]} + ${ids.length - 1} more` });

describe("a Regenerate goes to the front and de-duplicates the queue (D4)", () => {
  it("enqueueFront puts the item first and displaces nothing", () => {
    const queue = enqueueFront(enqueue([], first), second);
    expect(queue.map((i) => i.id)).toEqual([second.id, first.id]);
    expect(enqueueFront([], first)).toEqual([first]);
  });

  it("dropIdFrom removes the source from every waiting batch and keeps the rest", () => {
    const batch = queueItem(["fog", "court"], 2, "fog + 1 more");
    const other = queueItem(["court", "lamp"], 2, "court + 1 more");
    const { queue, touched } = dropIdFrom([batch, other], "court", resize);
    expect(touched).toBe(2);
    expect(queue.map((i) => i.id)).toEqual([batch.id, other.id]); // same batches, same order
    expect(queue[0].ids).toEqual(["fog"]);
    expect(queue[0].count).toBe(1);
    expect(queue[1].ids).toEqual(["lamp"]);
    expect(queue[1].label).toBe("lamp + 0 more"); // re-described, not stale
  });

  it("dropIdFrom drops a batch that the removal empties, and leaves unrelated batches alone", () => {
    const solo = queueItem(["court"], 1, "court");
    const { queue, touched } = dropIdFrom([solo, first], "court", resize);
    expect(queue.map((i) => i.id)).toEqual([first.id]);
    expect(touched).toBe(1);
    const untouched = dropIdFrom([first], "nope", resize);
    expect(untouched.touched).toBe(0);
    expect(untouched.queue).toEqual([first]);
  });

  it("queuedIds names every source a waiting batch carries, and nothing else", () => {
    expect([...queuedIds([first, second])].sort()).toEqual(["a", "b", "c"]);
    expect(queuedIds([]).size).toBe(0);
  });
});

describe("the popup's numbers come from one function (D2)", () => {
  const outcome = (index: number, saved: number, failed: number, missing: number) => batchOutcome({
    plan: PLAN, index, model: "openai/gpt-6.1-sol", saved, failed, missing,
    usage: NO_USAGE, error: null, elapsedMs: 0, requestId: null,
  });
  const live = (over: Partial<RunProgress>): RunProgress => ({
    batchId: "b2", index: 2, batches: 5, count: 4, cols: 2, rows: 2, composite: "", hash: "",
    saved: 0, failed: 0, missing: 0, startedAt: 0, perRequest: 4, outcomes: [], images: 20, ...over,
  } as RunProgress);

  it("reads nothing as nothing: no run and no queue", () => {
    expect(runTotals(null, [])).toEqual({ images: 0, done: 0, left: 0, failed: 0, request: 0, requests: 0 });
  });

  it("counts a request in flight: finished requests plus what the current one has settled", () => {
    const progress = live({ saved: 3, failed: 1, outcomes: [outcome(1, 4, 0, 0)] });
    expect(runTotals(progress, [])).toEqual({ images: 20, done: 8, left: 12, failed: 1, request: 2, requests: 5 });
  });

  it("does not count a finished request twice once its batch-done has landed", () => {
    const progress = live({ index: 1, saved: 3, failed: 1, outcomes: [outcome(1, 3, 1, 0)] });
    expect(runTotals(progress, []).done).toBe(4);
  });

  it("adds the waiting batches' images to what is left", () => {
    const progress = live({ outcomes: [outcome(1, 4, 0, 0)] });
    // 20 images, 4 settled: 16 unsettled in the run + 2 waiting in a batch
    expect(runTotals(progress, [queueItem(["x", "y"], 1, "x + 1 more")]).left).toBe(18);
  });

  it("after the end: nothing left unless it was never sent, and the failures are named", () => {
    const ended = live({ index: 5, saved: 0, failed: 0, missing: 0, outcomes: [outcome(1, 4, 0, 0), outcome(5, 3, 1, 0)] });
    expect(runTotals(ended, [])).toEqual({ images: 20, done: 8, left: 12, failed: 1, request: 5, requests: 5 });
  });
});
