// svg_queue.test.ts — the generation queue's pure half (RULE 8): appending
// never touches what is already waiting, the worker takes the HEAD and takes it
// once, removing one entry leaves the rest in order, and the label states what
// the user confirmed. Every test fails if the queue stops being a FIFO of
// frozen batches.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { capsFor, DEFAULT_PARAMS } from "../src/lib/modelcaps";
import {
  enqueue, nextQueued, queueLabel, queuedBatch, queuedSourceIds, removeQueued, type QueuedRun,
} from "../src/svg/queue";
import { svgSource } from "./helpers/svgpair";
import type { SvgSource } from "../src/svg/sources";

/** `n` frozen sources, as the confirmation freezes them. */
function runOf(n: number, over: Partial<QueuedRun> = {}): QueuedRun {
  const sources: SvgSource[] = Array.from({ length: n }, (_, i) => svgSource(`pair_${i + 1}`));
  return {
    sources, config: { ...DEFAULT_CONFIG }, caps: capsFor(DEFAULT_CONFIG.model),
    params: { ...DEFAULT_PARAMS }, prompt: "make icons", ...over,
  };
}

const batch = (ticket: string, n: number) => queuedBatch(ticket, runOf(n), 4);

describe("the queue is a FIFO of frozen batches", () => {
  it("appends without touching what is already waiting (append, never interrupt)", () => {
    const first = batch("q1", 2);
    const queue = enqueue(enqueue([], first), batch("q2", 1));
    expect(queue.map((b) => b.id)).toEqual(["q1", "q2"]);
    expect(queue[0]).toEqual(first); // the earlier batch is byte-identical
  });

  it("takes the head, in the order the user confirmed", () => {
    const queue = enqueue(enqueue([], batch("q1", 1)), batch("q2", 1));
    expect(nextQueued(queue)?.id).toBe("q1");
    expect(nextQueued(queue.slice(1))?.id).toBe("q2");
    expect(nextQueued([])).toBeNull();
  });

  it("removes exactly one entry and keeps the rest's order", () => {
    const queue = enqueue(enqueue(enqueue([], batch("q1", 1)), batch("q2", 2)), batch("q3", 1));
    expect(removeQueued(queue, "q2").map((b) => b.id)).toEqual(["q1", "q3"]);
    expect(removeQueued(queue, "missing").map((b) => b.id)).toEqual(["q1", "q2", "q3"]);
    expect(removeQueued(queue, "q1")).toHaveLength(2);
  });

  it("names every source it will run, so a row can show it is queued", () => {
    const queue = enqueue(enqueue([], batch("q1", 2)), batch("q2", 1));
    expect(queuedSourceIds(queue)).toEqual(["pair_1", "pair_2", "pair_1"]);
  });

  it("freezes the WHOLE confirmation: sources, config, caps, params and prompt", () => {
    const run = runOf(3, { prompt: "four split icons", config: { ...DEFAULT_CONFIG, imagesPerRequest: 2 } });
    const item = queuedBatch("q1", run, 2);
    expect(item.run.prompt).toBe("four split icons");
    expect(item.run.sources.map((s) => s.id)).toEqual(["pair_1", "pair_2", "pair_3"]);
    expect(item.sourceIds).toEqual(["pair_1", "pair_2", "pair_3"]);
    expect(item.run.config.imagesPerRequest).toBe(2);
  });
});

describe("the label states what will be sent", () => {
  it("counts the sources, the requests at the confirmed size and names the model", () => {
    expect(queueLabel(runOf(3), 2)).toBe("3 sources · 2 requests · openai/gpt-6.1-sol");
    expect(queueLabel(runOf(1), 4)).toBe("1 source · 1 request · openai/gpt-6.1-sol");
  });

  it("uses the singular for one source and one request, without guessing a model", () => {
    expect(queueLabel(runOf(1, { config: { ...DEFAULT_CONFIG, model: "" } }), 4)).toContain("1 source · 1 request ·");
  });
});
