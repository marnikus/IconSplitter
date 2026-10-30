import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { jobStore, reserveSources, sourcesBusy, parallelLimit, setParallelLimit, imagesBusy } from "../src/svg/jobstate";
import { skipCurrentSvgRequest } from "../src/svg/runjobs";
import { jobEvent, processTotals } from "../src/svg/jobprogress";
import { queueItem } from "../src/svg/runqueue";
import { toRow } from "../src/svg/rowmodel";
import { svgSource, pairMetaFor } from "./helpers/svgpair";
import type { RunCtx } from "../src/svg/runcontext";
import type { SvgJob } from "../src/svg/jobstate";

beforeEach(() => localStorage.clear());
function context(): RunCtx {
  const source = svgSource("pair_1", { name: "fog_AI.png" });
  return { rows: [toRow(source, pairMetaFor(source), false)],
    refs: { root: { current: null }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null }, scanKey: { current: null }, seq: { current: SCAN_IDLE } },
    setRowsFn: vi.fn(), setProgress: vi.fn(), setProgressFn: vi.fn(), setCurrent: vi.fn(), dispatch: vi.fn(), say: vi.fn(),
  } as unknown as RunCtx;
}
function job(): SvgJob {
  return { id: "running", label: "fog", ids: ["pair_1"], keys: ["architecture/fog_ai.svg.json"], controller: new AbortController(), requestController: null,
    status: "running", progress: null, current: null, outcomes: [], summary: "" };
}

describe("session process safety", () => {
  it("protects a waiting SVG's previewed image from a later image edit/main switch", () => {
    const c = context();
    c.refs.queue.current = [queueItem({ ids: ["pair_1"], label: "waiting", requests: 1 })];
    expect(reserveSources(c, ["pair_1"], "image")).toBeNull();
    expect(sourcesBusy(c, ["pair_1"])).toBe(false); // waiting is not a running process
  });
  it("drops only same-source waiting retries after an unknown outcome", () => {
    const c = context();
    const running = job();
    const same = queueItem({ ids: ["pair_1"], label: "same", requests: 1 });
    const other = queueItem({ ids: ["pair_2"], label: "independent", requests: 1 });
    c.refs.queue.current = [same, other];
    jobStore(c.refs).locks.set(running.keys[0], running.id);
    jobEvent(c, running, { kind: "item-failed", batchId: "b1", position: 1, sourceId: "pair_1", failure: "stalled", error: "unknown outcome", retryAfterMs: null });
    expect(c.refs.queue.current).toEqual([other]);
    expect(c.say).toHaveBeenCalledWith(expect.stringContaining("unknown"), true);
  });
  it("normalizes real sidecar paths and releases image ownership only for its owner", () => {
    const c = context();
    const release = reserveSources(c, ["pair_1"], "image")!;
    expect(sourcesBusy(c, ["pair_1"])).toBe(true);
    expect(imagesBusy(c, ["pair_1"])).toBe(true);
    expect(reserveSources(c, ["pair_1"])).toBeNull();
    release();
    const next = reserveSources(c, ["pair_1"], "image")!;
    release(); // a stale completion cannot release a newer image edit
    expect(imagesBusy(c, ["pair_1"])).toBe(true);
    next();
    expect(imagesBusy(c, ["pair_1"])).toBe(false);
  });
  it("validates the selectable provider-pressure limit and defaults to three", () => {
    expect(parallelLimit()).toBe(3);
    for (const n of [1, 2, 3]) { setParallelLimit(n); expect(parallelLimit()).toBe(n); }
    for (const n of [0, -1, 1.5, 99, NaN]) { setParallelLimit(n); expect(parallelLimit()).toBe(3); }
    localStorage.setItem("iconSplitter.svg.parallel.v1", "garbage");
    expect(parallelLimit()).toBe(3);
  });
  it("includes every active run and pending confirmation in aggregate remaining counts", () => {
    const waiting = queueItem({ ids: ["q1", "q2"], label: "queued", requests: 1 });
    const totals = processTotals([
      { id: "a", label: "first", status: "running", total: 3, summary: "", progress: null },
      { id: "b", label: "second", status: "running", total: 4, summary: "", progress: null },
      { id: "c", label: "cancelled", status: "cancelled", total: 2, summary: "", progress: null },
    ], [waiting]);
    expect(totals).toEqual({ done: 0, left: 9, images: 9, saved: 0, interrupted: true });
  });
});


it("skips only the foreground request, leaving sibling job/run controllers intact", () => {
  const c = context(); const first = job(); const second = { ...job(), id: "second" };
  first.requestController = new AbortController(); second.requestController = new AbortController();
  const store = jobStore(c.refs); store.jobs = [first, second]; store.foreground = second.id;
  expect(skipCurrentSvgRequest(c)).toBe(true);
  expect(second.requestController.signal.aborted).toBe(true);
  expect(first.requestController.signal.aborted).toBe(false);
  expect(first.controller.signal.aborted).toBe(false);
  expect(second.controller.signal.aborted).toBe(false);
  expect(skipCurrentSvgRequest(c)).toBe(false);
  second.requestController = null; expect(skipCurrentSvgRequest(c)).toBe(false);
  second.requestController = new AbortController(); second.status = "finished";
  expect(skipCurrentSvgRequest(c)).toBe(false);
  expect(second.requestController.signal.aborted).toBe(false);
});
