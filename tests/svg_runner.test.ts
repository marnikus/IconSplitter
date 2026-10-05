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

const SVG = (name: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${name}</title>`
  + `<path d="M2 2h20v20H2z"/></svg>`;

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
function requestItems(init: RequestInit): string[] {
  const body = JSON.parse(String(init.body)) as { messages: { content: { image_url?: { url: string } }[] }[] };
  const url = body.messages[0].content.find((c) => c.image_url)?.image_url?.url ?? "";
  return url.replace("data:image/png;base64,", "").split("|").filter(Boolean);
}

/** The SSE text that answers a request naming every one of its images. */
function streamFrames(items: string[]): string {
  const blocks = items.map((relPath, i) => {
    const name = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
    return `Position ${i + 1} — ${name}\n\`\`\`svg\n${SVG(name)}\n\`\`\``;
  }).join("\n\n");
  const delta = JSON.stringify({ choices: [{ delta: { content: blocks } }] });
  const usage = JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.01 } });
  return `data: ${delta}\n\ndata: ${usage}\n\ndata: [DONE]\n\n`;
}

/** A JSON answer (the provider that ignored `stream: true`). */
function answerFor(items: string[]): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: streamText(items) } }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.01 },
  }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1" } });
}

/** The blocks alone, for the JSON path (SSE wraps the same text in a frame). */
function streamText(items: string[]): string {
  return items.map((relPath, i) => {
    const name = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
    return `Position ${i + 1} — ${name}\n\`\`\`svg\n${SVG(name)}\n\`\`\``;
  }).join("\n\n");
}

/** A response body the test drives itself: nothing arrives until push(). */
interface ManualStream {
  body: ReadableStream<Uint8Array>;
  push: (...texts: string[]) => void;
  close: () => void;
}

function manualStream(): ManualStream {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  return {
    body,
    push: (...texts: string[]) => texts.forEach((text) => ctrl.enqueue(enc.encode(text))),
    close: () => ctrl.close(),
  };
}

function sseResponse(body: ReadableStream<Uint8Array>, requestId: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": requestId } });
}

type Mode = "json" | "sse" | "silent" | "never";

interface Transport {
  calls: { items: string[]; effort: string | null; stream: boolean; usage: boolean }[];
  fetch: typeof fetch;
  /** The manual bodies, one per call, for the tests that drive the stream. */
  streams: ManualStream[];
}

/**
 * Records every request. `mode` picks how each call answers: "sse" streams the
 * answer immediately, "silent" hands the test a body it must push into,
 * "json" is the provider that ignored streaming, "never" never answers.
 */
function transport(opts: { failAt?: number; mode?: Mode | ((call: number) => Mode) } = {}): Transport {
  const calls: Transport["calls"] = [];
  const streams: ManualStream[] = [];
  const doFetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const items = requestItems(init);
    const body = JSON.parse(String(init.body)) as { reasoning_effort?: string; stream?: boolean; stream_options?: { include_usage?: boolean } };
    calls.push({ items, effort: body.reasoning_effort ?? null, stream: body.stream === true, usage: body.stream_options?.include_usage === true });
    const index = calls.length;
    const mode = typeof opts.mode === "function" ? opts.mode(index) : opts.mode ?? "sse";
    if (mode === "never") {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (opts.failAt === index) return new Response("boom", { status: 500 });
    if (mode === "json") return answerFor(items);
    const stream = manualStream();
    streams[index - 1] = stream;
    if (mode === "sse") {
      stream.push(streamFrames(items));
      stream.close();
    }
    return sseResponse(stream.body, `req_${index}`);
  };
  return { calls, fetch: doFetch as unknown as typeof fetch, streams };
}

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
