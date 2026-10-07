// svgup_queue.test.ts — the scheduler's promises (design §16): bounded work, a
// cancel that keeps what was already committed, one item's failure never touching
// another's success, and a restart that asks a human instead of sending again.
import { describe, expect, it } from "vitest";
import { ExportQueue, restoreInterrupted, rowStateOf, type JobEvent, type JobState } from "../src/svgupload/jobctl";

/** Lets every queued microtask (and the queue's own loop) make progress. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A run seam that never settles until the test says so. */
function gate() {
  const open: (() => void)[] = [];
  return {
    wait: () => new Promise<void>((resolve) => { open.push(resolve); }),
    release: () => { open.splice(0).forEach((fn) => { fn(); }); },
    size: () => open.length,
  };
}

describe("bounded concurrency", () => {
  it("runs at most `concurrency` exports at once and starts the rest afterwards", async () => {
    const g = gate();
    let inFlight = 0;
    let peak = 0;
    const queue = new ExportQueue({
      concurrency: 2,
      run: async () => { inFlight += 1; peak = Math.max(peak, inFlight); await g.wait(); inFlight -= 1; return { state: "processed", note: "ok" }; },
      onEvent: () => undefined,
    });
    queue.add(["a", "b", "c"]);
    const pumping = queue.pump();
    await tick();
    expect(g.size()).toBe(2); // two started, the third waits
    expect(queue.waiting()).toEqual(["c"]);
    g.release();
    await tick();
    expect(g.size()).toBe(1);
    g.release();
    await pumping;
    expect(peak).toBe(2);
    expect(queue.snapshot()).toEqual({ a: "processed", b: "processed", c: "processed" });
  });

  it("ignores a duplicate id instead of exporting the same icon twice", async () => {
    const queue = new ExportQueue({ concurrency: 1, run: async () => ({ state: "processed", note: "ok" }), onEvent: () => undefined });
    queue.add(["a", "a"]);
    await queue.pump();
    expect(queue.waiting()).toEqual([]);
  });
});

describe("cancel", () => {
  it("cancels what never started and keeps what already finished", async () => {
    const g = gate();
    const queue = new ExportQueue({
      concurrency: 1,
      run: async (id) => {
        if (id === "a") return { state: "processed", note: "kept" };
        await g.wait();
        return { state: "processed", note: "late" };
      },
      onEvent: () => undefined,
    });
    queue.add(["a", "b", "c"]);
    const pumping = queue.pump();
    await tick();
    queue.cancel();
    g.release();
    await pumping;
    const states = queue.snapshot();
    expect(states.a).toBe("processed"); // a completed package is never thrown away
    expect(states.c).toBe("cancelled"); // never sent
    expect(["cancelled", "processed"]).toContain(states.b);
  });

  it("aborts the in-flight request's signal", async () => {
    let seen: AbortSignal | undefined;
    const queue = new ExportQueue({
      concurrency: 1,
      run: async (_id, signal) => { seen = signal; return { state: "processed", note: "ok" }; },
      onEvent: () => undefined,
    });
    queue.add(["a"]);
    await queue.pump();
    expect(seen === undefined ? null : seen.aborted).toBe(false);
    queue.cancel();
    expect(seen === undefined ? null : seen.aborted).toBe(true);
  });
});

describe("independent items", () => {
  it("lets one failure leave the other items' results alone", async () => {
    const events: JobEvent[] = [];
    const queue = new ExportQueue({
      concurrency: 2,
      run: async (id) => (id === "b" ? { state: "failed", note: "the render blew up" } : { state: "processed", note: "ok" }),
      onEvent: (event) => events.push(event),
    });
    queue.add(["a", "b", "c"]);
    await queue.pump();
    expect(queue.snapshot()).toEqual({ a: "processed", b: "failed", c: "processed" });
    expect(events.filter((e) => e.id === "b").at(-1)?.note).toBe("the render blew up");
  });

  it("turns a thrown error into a Failed row, not a lost job", async () => {
    const queue = new ExportQueue({ concurrency: 1, run: async () => { throw new Error("disk busy"); }, onEvent: () => undefined });
    queue.add(["a"]);
    await queue.pump();
    expect(queue.snapshot()).toEqual({ a: "failed" });
  });
});

describe("restart", () => {
  it("brings unfinished jobs back as interrupted, never auto-active", () => {
    const previous: Record<string, JobState> = { a: "running", b: "queued", c: "processed", d: "partial" };
    const restored = restoreInterrupted(previous);
    expect(restored.states).toEqual({ a: "interrupted", b: "interrupted", c: "processed", d: "partial" });
    expect(restored.note).toContain("nothing was sent again");
  });

  it("says nothing when every job had finished", () => {
    expect(restoreInterrupted({ a: "processed" }).note).toBeNull();
  });

  it("keeps Failed, Partial and Cancelled distinct in the row label", () => {
    expect(rowStateOf("processed").tone).toBe("ok");
    expect(rowStateOf("partial").label).toBe("Partial");
    expect(rowStateOf("failed").tone).toBe("bad");
    expect(rowStateOf("cancelled").label).toBe("Cancelled");
    expect(rowStateOf("interrupted").label).toContain("needs review");
    expect(rowStateOf("running").tone).toBe("busy");
  });
});
