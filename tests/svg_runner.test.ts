// svg_runner.test.ts — the batched run executes end to end against a fake
// transport and an in-memory FS (RULE 8): the selection really becomes several
// requests, every returned SVG lands beside the source it was drawn from, each
// request keeps its own tokens and cost, and one failed request never damages
// the successful ones. Each test fails if the runner stops splitting, stops
// honouring the effort cap, or stops isolating a batch failure.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { effectiveTimeoutMs, EFFORT_RULES } from "../src/lib/effortlimits";
import { compositeLayout } from "../src/lib/svgcomposite";
import { runGeneration, type RunEvent, type RunSummary } from "../src/svg/runner";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";

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
    const relPath = `architecture/${name}`;
    arch.children.set(name, new FakeFile(name, 20, 3000 + i, "png"));
    sources.push({ id: `pair_${i}`, name, stem: `icon-${i}_AI`, relPath, dirPath: "architecture", fingerprint: `20:${3000 + i}` });
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

/** An answer that names every image of the request it is answering. */
function answerFor(items: string[]): Response {
  const blocks = items.map((relPath, i) => {
    const name = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
    return `Position ${i + 1} — ${name}\n\`\`\`svg\n${SVG(name)}\n\`\`\``;
  }).join("\n\n");
  return new Response(JSON.stringify({
    choices: [{ message: { content: blocks } }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.01 },
  }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1" } });
}

interface Transport {
  calls: { items: string[]; effort: string | null }[];
  fetch: typeof fetch;
}

/** Records every request; `failAt` (1-based) answers 500, `never` never answers. */
function transport(opts: { failAt?: number; never?: boolean } = {}): Transport {
  const calls: Transport["calls"] = [];
  const doFetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const items = requestItems(init);
    const body = JSON.parse(String(init.body)) as { reasoning_effort?: string };
    calls.push({ items, effort: body.reasoning_effort ?? null });
    if (opts.never) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (opts.failAt === calls.length) return new Response("boom", { status: 500 });
    return answerFor(items);
  };
  return { calls, fetch: doFetch as unknown as typeof fetch };
}

function runArgs(root: FakeDir, sources: SvgSource[], config: Partial<SvgConfig>, params: SamplingParams) {
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
      sidecars: new Map(),
      onEvent: (e: RunEvent) => events.push(e),
      signal: new AbortController().signal,
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it("splits by the reasoning level, not the configured size (medium -> 2, high -> 1)", async () => {
    const { root, sources } = fixture(8);
    const medium = transport();
    vi.stubGlobal("fetch", medium.fetch);
    const first = await runGeneration(runArgs(root, sources, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "medium" }).args);
    expect(medium.calls).toHaveLength(4);
    expect(medium.calls.every((c) => c.items.length === 2)).toBe(true);
    expect(medium.calls.every((c) => c.effort === "medium")).toBe(true);
    expect(first.outcomes.map((o) => o.count)).toEqual([2, 2, 2, 2]);

    const { root: root2, sources: sources2 } = fixture(3);
    const high = transport();
    vi.stubGlobal("fetch", high.fetch);
    const second = await runGeneration(runArgs(root2, sources2, { imagesPerRequest: 4 }, { temperature: null, maxTokens: 8_000, effort: "high" }).args);
    expect(high.calls).toHaveLength(3);
    expect(high.calls.every((c) => c.items.length === 1)).toBe(true);
    expect(second.perRequest).toBe(1);
    expect(second.saved).toBe(3);
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

  it("raises the wait to the tier floor and explains a timeout", async () => {
    vi.useFakeTimers();
    const { root, sources } = fixture(1);
    const t = transport({ never: true });
    vi.stubGlobal("fetch", t.fetch);
    const { args } = runArgs(root, sources, { imagesPerRequest: 4, timeoutMs: 1_000 }, { temperature: null, maxTokens: 8_000, effort: "high" });

    const pending = runGeneration(args);
    await vi.advanceTimersByTimeAsync(EFFORT_RULES.high.timeoutMs);
    const summary = await pending;

    expect(effectiveTimeoutMs(1_000, args.caps, args.params)).toBe(EFFORT_RULES.high.timeoutMs);
    expect(summary.saved).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.problems.join(" ")).toContain("600s");
    expect(summary.problems.join(" ")).toContain("high");
  });
});
