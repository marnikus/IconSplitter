// svg_runner.test.ts — the batched run executes end to end against a fake
// streaming transport and an in-memory FS (RULE 8): the selection really
// becomes several requests AT THE USER'S SIZE (the reasoning tier never shrinks
// it), every returned SVG lands beside the source it was drawn from, each
// request keeps its own tokens and cost, one failed request never damages the
// successful ones, a request that keeps talking survives far past the
// configured timeout, and a silent one is reported as outcome unknown without
// ever being resent. Each test fails if the runner starts capping the batch,
// retrying a stall, or forgetting the in-flight journal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { effectiveStallMs, EFFORT_RULES } from "../src/lib/effortlimits";
import { clearInflight, inflightSummary, loadInflight } from "../src/svg/journal";
import { compositeLayout } from "../src/lib/svgcomposite";
import { runGeneration, type RunEvent, type RunSummary } from "../src/svg/runner";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { streamFrames, transport } from "./helpers/svgtransport";
import { svgSource } from "./helpers/svgpair";

// The contact sheet is the only browser-canvas step; its own pixel test lives
// in tests/svg_canvas.test.ts. Here it is replaced by a deterministic marker so
// the REAL planning, sending, matching, saving and reporting run.
vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => {
      const list = sources;
      return {
        dataUrl: `data:image/png;base64,${list.map((s) => s.relPath).join("|")}`,
        hash: `h${list.length}`,
        layout: compositeLayout(list.length),
        bytes: 10,
      };
    }),
  };
});

const { buildComposite } = await import("../src/svg/composite");
const compositeCalls = vi.mocked(buildComposite);


/** `n` approved sources, `architecture/icon-N_AI.png`, files present on disk. */
function fixture(n: number): { root: FakeDir; sources: SvgSource[] } {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  const sources: SvgSource[] = [];
  for (let i = 1; i <= n; i += 1) {
    const name = `icon-${i}_AI.png`;
    arch.children.set(name, new FakeFile(name, 20, 3000 + i, "png"));
    sources.push(svgSource(`pair_${i}`, { name, fingerprint: `20:${3000 + i}` }));
  }
  root.children.set("architecture", arch);
  return { root, sources };
}

/** The relPaths the composite of one request carried — the batch's real items. */

/** Drains microtasks without advancing the fake clock. */
const flush = async () => { for (let i = 0; i < 24; i += 1) await Promise.resolve(); };

/**
 * Lets the run reach the state the test needs to poke. `advanceTimersByTimeAsync(0)`
 * runs the faked microtask queue without moving the clock, which is what the
 * stream plumbing needs while fake timers are installed.
 */
async function settle(pred: () => boolean, steps = 200): Promise<void> {
  for (let i = 0; i < steps && !pred(); i += 1) await vi.advanceTimersByTimeAsync(0);
  if (!pred()) throw new Error("the run never reached the expected state");
}


function runArgs(root: FakeDir, sources: SvgSource[], config: Partial<SvgConfig>, params: SamplingParams, signal: AbortSignal = new AbortController().signal) {
  const events: RunEvent[] = [];
  const full: SvgConfig = { ...DEFAULT_CONFIG, retries: 0, ...config };
  return {
    events,
    args: {
      root,
      apiKey: ["rq", "live", "runner_test_key_1234"].join("_"),
      config: full,
      caps: capsFor(full.model),
      params,
      prompt: "p",
      sources,
      metas: new Map(),
      onEvent: (e: RunEvent) => events.push(e),
      signal,
    },
  };
}

/** The SVG file written beside a source, or null. */
async function svgText(root: FakeDir, source: SvgSource): Promise<string | null> {
  const dir = await root.getDirectoryHandle("architecture");
  const file = dir.children.get(`${source.stem}.svg`);
  return file instanceof FakeFile ? file.text : null;
}

// The module mock is intentionally never cleared: vitest 5's mockClear()
// re-invokes the implementation with no arguments (observed in tinyspy), which
// would add a phantom call. Tests read the calls they made instead.
let callsAtStart = 0;
beforeEach(() => { callsAtStart = compositeCalls.mock.calls.length; });
beforeEach(() => clearInflight());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearInflight();
});

describe("runGeneration — one request per batch", () => {
  it("sends 8 images as 2 requests of 4 and maps every SVG back to its source", async () => {
    const { root, sources } = fixture(8);
    const t = transport();
    vi.stubGlobal("fetch", t.fetch);
    const { args, events } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "low" });

    const summary: RunSummary = await runGeneration(args);

    expect(t.calls).toHaveLength(2);
    expect(t.calls[0].items).toEqual(sources.slice(0, 4).map((s) => s.relPath));
    expect(t.calls[1].items).toEqual(sources.slice(4).map((s) => s.relPath));
    expect(summary.batches).toBe(2);
    expect(summary.perRequest).toBe(4);
    expect(summary.saved).toBe(8);
    expect(summary.outcomes.map((o) => [o.index, o.count, o.status, o.saved])).toEqual([
      [1, 4, "done", 4], [2, 4, "done", 4],
    ]);
    // every result was written beside ITS source, with its own title intact
    for (const source of sources) {
      expect(await svgText(root, source)).toContain(`<title>${source.stem}</title>`);
    }
    // per-request tokens and cost are kept apart, provider-reported
    expect(summary.outcomes[0].usage.total).toBe(300);
    expect(summary.outcomes[0].cost.actual).toBe(0.01);
    expect(summary.usage.total).toBe(600);
    expect(events.filter((e) => e.kind === "batch-start")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "batch-done")).toHaveLength(2);
    // the run's image total travels with the start events, and every finished
    // request says how many images of the run are done so far (2026-10-08)
    expect(events.find((e) => e.kind === "run-start")).toMatchObject({ images: 8 });
    expect(events.filter((e) => e.kind === "batch-start").map((e) => (e.kind === "batch-start" ? e.images : 0))).toEqual([8, 8]);
    // ...and the run's own id, so a reader can tell one run from the next (batch ids repeat per run)
    const runIds = events.filter((e) => e.kind === "batch-start").map((e) => (e.kind === "batch-start" ? e.runId : ""));
    expect(runIds[0]).toMatch(/\S/);
    expect(runIds[1]).toBe(runIds[0]);
    expect(events.filter((e) => e.kind === "batch-done").map((e) => (e.kind === "batch-done" ? [e.done, e.images] : []))).toEqual([[4, 8], [8, 8]]);
  });

  it("keeps the user's batch size at every reasoning level (medium and high too)", async () => {
    const { root, sources } = fixture(8);
    const medium = transport();
    vi.stubGlobal("fetch", medium.fetch);
    const first = await runGeneration(runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "medium" }).args);
    expect(medium.calls.map((c) => c.items.length)).toEqual([4, 4]);
    expect(medium.calls.every((c) => c.effort === "medium")).toBe(true);
    expect(medium.calls.every((c) => c.stream && c.usage)).toBe(true);
    expect(first.perRequest).toBe(4);
    expect(first.outcomes.map((o) => o.count)).toEqual([4, 4]);

    // A big batch at high effort stays ONE request of the configured size.
    const { root: root2, sources: sources2 } = fixture(3);
    const high = transport();
    vi.stubGlobal("fetch", high.fetch);
    const second = await runGeneration(runArgs(root2, sources2, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "high" }).args);
    expect(high.calls.map((c) => c.items.length)).toEqual([3]);
    expect(second.perRequest).toBe(4);
    expect(second.saved).toBe(3);
  });

  it("still accepts a provider that ignores stream: true and answers JSON", async () => {
    const { root, sources } = fixture(1);
    const t = transport({ mode: "json" });
    vi.stubGlobal("fetch", t.fetch);
    const { args, events } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: null });

    const summary = await runGeneration(args);

    expect(summary.saved).toBe(1);
    const saved = events.find((e) => e.kind === "item-saved");
    expect(saved?.kind === "item-saved" && saved.meta?.versions.at(-1)?.requestId).toBe("req_1");
  });

  it("keeps the last partial batch a square grid with its empty cell (3 images at 4)", async () => {
    const { root, sources } = fixture(3);
    const t = transport();
    vi.stubGlobal("fetch", t.fetch);
    const summary = await runGeneration(runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: null }).args);
    expect(summary.batches).toBe(1);
    expect(summary.outcomes[0].count).toBe(3);
    const calls = compositeCalls.mock.calls.slice(callsAtStart);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toHaveLength(3);
    const start = summary.outcomes[0];
    expect(start.id).toBe("batch_1_3");
    const built = await compositeCalls.mock.results[callsAtStart].value;
    expect(built.layout.cols).toBe(2);
    expect(built.layout.empty).toEqual([4]);
  });

  it("one failed request leaves the successful batch's files untouched", async () => {
    const { root, sources } = fixture(8);
    const t = transport({ failAt: 2 });
    vi.stubGlobal("fetch", t.fetch);
    const { args } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "low" });

    const summary = await runGeneration(args);

    expect(summary.saved).toBe(4);
    expect(summary.failed).toBe(4);
    expect(summary.outcomes.map((o) => o.status)).toEqual(["done", "failed"]);
    for (const source of sources.slice(0, 4)) expect(await svgText(root, source)).not.toBeNull();
    for (const source of sources.slice(4)) expect(await svgText(root, source)).toBeNull();
    // the failed batch's error is recorded without touching the good one's cost
    expect(summary.outcomes[1].error).toContain("500");
    expect(summary.outcomes[0].error).toBeNull();
    expect(summary.problems.join(" ")).toContain("500");
  });

  it("splits a large selection too (23 images -> 6 requests, 4 x5 + 3)", async () => {
    const { root, sources } = fixture(23);
    const t = transport();
    vi.stubGlobal("fetch", t.fetch);
    const { args } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "low" });

    const summary = await runGeneration(args);

    expect(t.calls.map((c) => c.items.length)).toEqual([4, 4, 4, 4, 4, 3]);
    expect(summary.batches).toBe(6);
    expect(summary.saved).toBe(23);
    expect(summary.outcomes.map((o) => o.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(summary.outcomes.every((o) => o.status === "done" && o.count === o.saved)).toBe(true);
    // every source got ITS OWN file, and the last request's grid is a 2x2 with
    // one empty cell — the empty cell never becomes output
    for (const source of sources) expect(await svgText(root, source)).toContain(`<title>${source.stem}</title>`);
    const calls = compositeCalls.mock.calls.slice(callsAtStart);
    expect(calls.map((c) => c[1].length)).toEqual([4, 4, 4, 4, 4, 3]);
    const last = await compositeCalls.mock.results[callsAtStart + 5].value;
    expect(last.layout.cols).toBe(2);
    expect(last.layout.empty).toEqual([4]);
  });

  it("sends 9 images as 4 + 4 + 1, the last request a partial square", async () => {
    const { root, sources } = fixture(9);
    const t = transport();
    vi.stubGlobal("fetch", t.fetch);
    const { args, events } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "low" });

    const summary = await runGeneration(args);

    expect(t.calls.map((c) => c.items.length)).toEqual([4, 4, 1]);
    expect(summary.batches).toBe(3);
    expect(summary.saved).toBe(9);
    expect(summary.outcomes.map((o) => [o.index, o.count, o.status])).toEqual([
      [1, 4, "done"], [2, 4, "done"], [3, 1, "done"],
    ]);
    // the partial request keeps the square grid of its own page
    const calls = compositeCalls.mock.calls.slice(callsAtStart);
    expect(calls.map((c) => c[1].length)).toEqual([4, 4, 1]);
    const last = await compositeCalls.mock.results[callsAtStart + 2].value;
    expect(last.layout.cols).toBe(1);
    expect(last.layout.empty).toEqual([]);
    // three batch-start events, each naming its own request index
    const starts = events.filter((e) => e.kind === "batch-start");
    expect(starts.map((e) => (e.kind === "batch-start" ? e.index : 0))).toEqual([1, 2, 3]);
    for (const source of sources) expect(await svgText(root, source)).toContain(`<title>${source.stem}</title>`);
  });

  it("lets a live request run past the configured timeout — liveness, not duration, decides", async () => {
    vi.useFakeTimers();
    const { root, sources } = fixture(1);
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    const { args, events } = runArgs(root, sources, { imagesPerRequest: 4, timeoutMs: 1_000 }, { temperature: null, maxTokens: 8_000, effort: "high" });
    let settled = false;
    const pending = runGeneration(args).then((summary) => { settled = true; return summary; });
    await flush();

    // 120x the configured window, and still nothing has been cut.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe(false);
    // A keepalive comment counts as liveness: the window restarts.
    t.streams[0].push(": keepalive\n\n");
    await vi.advanceTimersByTimeAsync(300_000);
    expect(settled).toBe(false);
    t.streams[0].push(streamFrames([sources[0].relPath]));
    t.streams[0].close();

    const summary = await pending;

    expect(t.calls).toHaveLength(1);
    expect(summary.saved).toBe(1);
    expect(summary.failed).toBe(0);
    // the strip can say how long the request really took
    expect(summary.outcomes[0].elapsedMs).toBeGreaterThanOrEqual(420_000);
    const start = events.find((e) => e.kind === "batch-start");
    expect(typeof (start?.kind === "batch-start" ? start.startedAt : null)).toBe("number");
    expect(loadInflight()).toEqual([]);
  });

  it("reports a silent stream as outcome unknown, keeps its id and never resends it", async () => {
    vi.useFakeTimers();
    const { root, sources } = fixture(1);
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    const { args } = runArgs(root, sources, { imagesPerRequest: 4, timeoutMs: 1_000, retries: 2 }, { temperature: null, maxTokens: 8_000, effort: "high" });
    let settled = false;
    const pending = runGeneration(args).then((summary) => { settled = true; return summary; });
    await flush();
    expect(loadInflight()).toHaveLength(1);
    expect(effectiveStallMs(1_000, args.caps, args.params)).toBe(EFFORT_RULES.high.stallMs);

    // Keepalives keep it alive; then the socket goes quiet for the 600s floor.
    t.streams[0].push(": keepalive\n\n");
    await vi.advanceTimersByTimeAsync(599_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);

    const summary = await pending;

    expect(summary.saved).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.outcomes[0].status).toBe("unknown");
    // retries were configured; a stall is still never repeated
    expect(t.calls).toHaveLength(1);
    expect(summary.problems.join(" ")).toContain("unknown");
    expect(summary.problems.join(" ")).toContain("not been resent");
    // the id survives so the provider can be asked what happened
    const left = loadInflight();
    expect(left).toHaveLength(1);
    expect(left[0].requestId).toBe("req_1");
    expect(inflightSummary(left)).toContain("Nothing has been resent");
  });

  it("journals an in-flight request with its id and clears it once the answer is saved", async () => {
    vi.useFakeTimers();
    const { root, sources } = fixture(2);
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    const { args, events } = runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "medium" });
    const pending = runGeneration(args);
    await flush();

    const during = loadInflight();
    expect(during).toHaveLength(1);
    expect(during[0].batchId).toBe("batch_1_2");
    expect(during[0].runId).toMatch(/^run_/);
    expect(during[0].requestId).toBe("req_1");
    expect(during[0].sourceNames).toEqual(["icon-1_AI.png", "icon-2_AI.png"]);

    t.streams[0].push(streamFrames(sources.map((s) => s.relPath)));
    t.streams[0].close();
    const summary = await pending;

    expect(summary.saved).toBe(2);
    expect(loadInflight()).toEqual([]);
    const saved = events.find((e) => e.kind === "item-saved");
    expect(saved?.kind === "item-saved" && saved.meta?.versions.at(-1)?.requestId).toBe("req_1");
  });

  it("cancelling mid-stream keeps the finished request and records the cut one", async () => {
    vi.useFakeTimers();
    const { root, sources } = fixture(2);
    const t = transport({ mode: (call) => (call === 1 ? "sse" : "silent") });
    vi.stubGlobal("fetch", t.fetch);
    const controller = new AbortController();
    const { args } = runArgs(root, sources, { imagesPerRequest: 1 }, { temperature: null, maxTokens: 8_000, effort: "low" }, controller.signal);
    let settled = false;
    const pending = runGeneration(args).then((summary) => { settled = true; return summary; });
    // request 1 is saved, request 2 is in flight and silent
    await settle(() => t.calls.length === 2);
    controller.abort();
    await settle(() => settled);

    const summary = await pending;

    expect(t.calls).toHaveLength(2);
    expect(summary.saved).toBe(1);
    expect(summary.cancelled).toBe(true);
    expect(summary.outcomes.map((o) => [o.status, o.saved])).toEqual([["done", 1], ["failed", 0]]);
    // a cancel IS a confirmed outcome: nothing is left dangling in the journal
    expect(loadInflight()).toEqual([]);
  });
});
