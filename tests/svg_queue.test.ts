// svg_queue.test.ts — the queue's own rules (I-53), proven without a DOM or a
// network: a confirmed batch APPENDS, only the head may start, a drop leaves the
// rest in order, a cancel empties it and reports how much it dropped, and a
// queued batch never becomes a row status (it is a scheduling fact, not a state
// of the file). Getting these wrong is what silently lost the user's added work.
import { describe, expect, it } from "vitest";
import {
  dropAll, dropIdFrom, dropQueued, enqueue, enqueueFront, nextRun, queuedCount, queuedIds, queueItem, shiftQueue,
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

describe("the front of the queue (2026-10-08: Regenerate is the NEXT attempt)", () => {
  const retry = queueItem(["b"], 1, "court_AI.png");

  it("enqueueFront puts the item first and displaces nothing behind it", () => {
    const queue = enqueueFront([first, second], retry);
    expect(queue.map((i) => i.id)).toEqual([retry.id, first.id, second.id]);
    expect(enqueueFront([], retry).map((i) => i.id)).toEqual([retry.id]);
    expect(nextRun(queue, false)?.id).toBe(retry.id); // it is what starts next
  });

  it("dropIdFrom removes the source from every later batch, drops a batch left empty, and counts what it touched", () => {
    const replan = (ids: readonly string[]) => ({ requests: Math.max(1, Math.ceil(ids.length / 1)), label: ids.join("+") });
    const { queue, removedFrom } = dropIdFrom([first, second], "b", replan);
    expect(removedFrom).toBe(1);
    expect(queue.map((i) => i.id)).toEqual([first.id, second.id]);
    expect(queue[1]).toMatchObject({ ids: ["c"], count: 1, requests: 1, label: "c" }); // shrunk, re-planned, re-labelled
    const emptied = dropIdFrom([first, second], "a", replan);
    expect(emptied.queue.map((i) => i.id)).toEqual([second.id]); // `first` carried only "a"
    expect(emptied.removedFrom).toBe(1);
    const untouched = dropIdFrom([first, second], "zzz", replan);
    expect(untouched.removedFrom).toBe(0);
    expect(untouched.queue).toEqual([first, second]);
  });

  it("queuedIds names every source that waits, once", () => {
    expect([...queuedIds([first, second, retry])].sort()).toEqual(["a", "b", "c"]);
    expect(queuedIds([]).size).toBe(0);
  });
});
