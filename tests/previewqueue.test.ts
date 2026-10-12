// previewqueue.test.ts — TDD for the preview session's scheduler (design D3/D4/T5).
// Pure logic with an injected yield: the queue owns order, one-job-in-flight,
// generations, cancellation and per-row isolation. Nothing here touches the DOM.

import { describe, expect, it } from "vitest";
import { createPreviewQueue, type PreviewRow, type QueueEvent } from "../src/lib/previewqueue";

interface RowData {
  key: string;
}

function row(key: string, near: boolean, order: string[], active: { n: number; max: number }, delay = 0): PreviewRow<RowData> {
  return {
    key,
    near,
    work: async (token) => {
      active.n++;
      active.max = Math.max(active.max, active.n);
      order.push(key);
      if (token.cancelled) return { kind: "empty" };
      await Promise.resolve();
      active.n--;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { kind: "ok", value: { key } };
    },
  };
}

function recorder() {
  const events: QueueEvent<RowData>[] = [];
  return { events, onEvent: (e: QueueEvent<RowData>) => void events.push(e) };
}

describe("previewqueue — visible first, one at a time, never a stale paint", () => {
  it("plans near-viewport rows first, then the rest in list order (D4)", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const q = createPreviewQueue<RowData>();
    q.setRows(
      [
        row("a", false, order, active),
        row("b", true, order, active),
        row("c", false, order, active),
        row("d", true, order, active),
      ],
      1,
    );
    await q.settled();
    expect(order).toEqual(["b", "d", "a", "c"]);
  });

  it("keeps exactly one job in flight (D5: one image at a time)", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const q = createPreviewQueue<RowData>();
    q.setRows([1, 2, 3, 4, 5].map((i) => row(`r${i}`, false, order, active)), 1);
    await q.settled();
    expect(active.max).toBe(1);
    expect(order).toHaveLength(5);
  });

  it("hands every job the plan's generation, so a result is never stored under a stale one", async () => {
    const seen: number[] = [];
    const q = createPreviewQueue<RowData>();
    q.setRows(
      ["a", "b"].map((key) => ({
        key,
        near: false,
        work: async (token) => {
          seen.push(token.generation);
          return { kind: "ok" as const, value: { key } };
        },
      })),
      7,
    );
    await q.settled();
    expect(seen).toEqual([7, 7]);
  });

  it("reports progress as rows finish", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const { events, onEvent } = recorder();
    const q = createPreviewQueue<RowData>();
    q.on(onEvent);
    q.setRows([row("a", false, order, active), row("b", false, order, active)], 7);
    await q.settled();
    expect(events.filter((e) => e.kind === "row-done").map((e) => e.key)).toEqual(["a", "b"]);
    expect(q.progress()).toEqual({ done: 2, total: 2, icons: 2 });
    expect(events.at(-1)?.kind).toBe("idle");
  });

  it("a new generation supersedes the old: the stale completion is never emitted", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const { events, onEvent } = recorder();
    const q = createPreviewQueue<RowData>();
    q.on(onEvent);
    q.setRows([row("old1", false, order, active, 5), row("old2", false, order, active)], 1);
    q.setRows([row("new1", false, order, active)], 2); // replan while old1 is in flight
    await q.settled();
    const done = events.filter((e) => e.kind === "row-done").map((e) => e.key);
    expect(done).toEqual(["new1"]);
    expect(order).not.toContain("old2");
    expect(q.progress().total).toBe(1);
  });

  it("cancel() stops before the next row and says the row it cut was stopped", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const { events, onEvent } = recorder();
    const q = createPreviewQueue<RowData>();
    q.on(onEvent);
    const slow: PreviewRow<RowData> = {
      key: "slow",
      near: true,
      work: async () => {
        order.push("slow");
        q.cancel();
        await Promise.resolve();
        return { kind: "ok", value: { key: "slow" } };
      },
    };
    const later = row("later", false, order, active);
    q.setRows([slow, later], 1);
    await q.settled();
    expect(order).toEqual(["slow"]);
    expect(events.some((e) => e.kind === "row-stopped" && e.key === "slow")).toBe(true);
    expect(events.some((e) => e.kind === "row-done")).toBe(false);
    expect(events.at(-1)?.kind).toBe("idle");
  });

  it("a throwing row is reported and the session carries on (I-68)", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const { events, onEvent } = recorder();
    const q = createPreviewQueue<RowData>();
    q.on(onEvent);
    const boom: PreviewRow<RowData> = {
      key: "boom",
      near: true,
      work: async () => {
        order.push("boom");
        throw new Error("decode failed");
      },
    };
    q.setRows([boom, row("ok", false, order, active)], 1);
    await q.settled();
    expect(order).toEqual(["boom", "ok"]);
    const err = events.find((e) => e.kind === "row-error");
    expect(err && "message" in err ? err.message : "").toContain("decode failed");
    expect(q.progress().done).toBe(2);
  });

  it("replanning the same rows under the same generation is a no-op", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const q = createPreviewQueue<RowData>();
    q.setRows([row("a", false, order, active)], 3);
    q.setRows([row("a", false, order, active)], 3); // same key set, same generation
    await q.settled();
    expect(order).toEqual(["a"]);
  });

  it("an empty plan is idle immediately, never a spinning session", async () => {
    const { events, onEvent } = recorder();
    const q = createPreviewQueue<RowData>();
    q.on(onEvent);
    q.setRows([], 1);
    await q.settled();
    expect(events.map((e) => e.kind)).toEqual(["idle"]);
    expect(q.progress()).toEqual({ done: 0, total: 0, icons: 0 });
  });

  it("unsubscribing stops the events; dispose() leaves nothing running", async () => {
    const order: string[] = [];
    const active = { n: 0, max: 0 };
    const q = createPreviewQueue<RowData>();
    const off = q.on(() => undefined);
    off();
    q.setRows([row("a", false, order, active)], 1);
    await q.settled();
    q.dispose();
    expect(order).toEqual(["a"]);
  });
});
