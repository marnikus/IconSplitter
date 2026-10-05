// svg_cost_io.test.ts — the cost a request produced survives the sidecar round
// trip and matches the request metadata exactly (RULE 8/13). The run test drives
// the REAL runner against a fake transport: provider-reported numbers stay
// reported, a batch total becomes a labelled share, and a charged-but-invalid
// result still records what it cost.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_COST, newSidecar, parseSidecar, serializeSidecar } from "../src/lib/svgfile";
import { PRICING_VERSION } from "../src/lib/svgpricing";
import { NO_USAGE, TRUNCATED_MESSAGE } from "../src/lib/svgrequest";
import { allocateUsage, costLabel } from "../src/lib/svgusage";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { DEFAULT_PARAMS, capsFor } from "../src/lib/modelcaps";
import { recordFailure, saveSvgVersion } from "../src/svg/saveversion";
import { loadSidecar, saveSidecar } from "../src/svg/sidecar";
import { toListRow, toRow } from "../src/svg/rowmodel";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";

// Deterministic pixels: the composite path is exercised for real (canvas shims)
// while image decoding and blob reading are replaced, never the runner itself.
vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...actual,
    loadImageFile: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  };
});

const source: SvgSource = {
  id: "pair_fog", name: "fog_AI.png", stem: "fog_AI",
  relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100",
};

const SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

function root(): FakeDir {
  const dir = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  arch.children.set("keep_AI.png", new FakeFile("keep_AI.png", 20, 1100, "f"));
  arch.children.set("lane_AI.png", new FakeFile("lane_AI.png", 20, 1000, "g"));
  dir.children.set("architecture", arch);
  return dir;
}

const courtSource: SvgSource = { ...source, id: "pair_court", name: "court_AI.png", stem: "court_AI", relPath: "architecture/court_AI.png" };
const keepSource: SvgSource = { ...source, id: "pair_keep", name: "keep_AI.png", stem: "keep_AI", relPath: "architecture/keep_AI.png" };
const laneSource: SvgSource = { ...source, id: "pair_lane", name: "lane_AI.png", stem: "lane_AI", relPath: "architecture/lane_AI.png" };

/** The same fake transport, recording every request body it was handed. */
function stubFetchCapture(content: string, usage: Record<string, unknown>): { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }], usage }),
      { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1" } },
    );
  }));
  return { bodies };
}

function saveArgs(usage = NO_USAGE, model = DEFAULT_CONFIG.model) {
  return {
    root: root(), source, code: SVG, prompt: "p", provider: "Requesty", model,
    requestedAt: "2026-10-01T10:00:00.000Z", usage, batch: null, requestId: null, sidecar: null,
  };
}

function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ fillStyle: "", fillRect: () => undefined, drawImage: () => undefined }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) { cb(new Blob(["png"], { type: "image/png" })); });
}

function stubFetch(content: string, usage: Record<string, unknown>): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage }),
    { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1" } },
  )));
}

function block(title: string, body: string): string {
  return "```svg\n" + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${title}</title>${body}</svg>` + "\n```";
}

afterEach(() => vi.restoreAllMocks());

describe("cost in the sidecar", () => {
  it("stores the provider-reported cost, currency, model and pricing version", async () => {
    const args = saveArgs({ input: 5, output: 6, total: 11, cost: 0.0021, currency: "USD" });
    const saved = await saveSvgVersion(args);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.sidecar.versions[0].cost).toEqual({
      actual: 0.0021, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "provider",
    });
    expect(saved.sidecar.versions[0].model).toBe(DEFAULT_CONFIG.model);
    expect(saved.sidecar.versions[0].usage).toEqual({ input: 5, output: 6, total: 11 });
    await saveSidecar(args.root, source, saved.sidecar);

    // restart: a fresh read off the disk sees the same money
    const reloaded = await loadSidecar(args.root, source);
    expect(reloaded.sidecar?.versions[0].cost).toEqual(saved.sidecar.versions[0].cost);
    expect(serializeSidecar(reloaded.sidecar ?? newSidecar({ relPath: "x", name: "x", fingerprint: "1:1" })))
      .toContain(PRICING_VERSION);
    expect(toListRow(toRow(source, reloaded.sidecar, false)).cost).toBe(0.0021);
    expect(costLabel(reloaded.sidecar?.versions[0].cost ?? NO_COST)).toBe("$0.0021 reported");
  });

  it("keeps a batch share labelled as an estimate, never as a reported number", async () => {
    const shared = allocateUsage({ input: 40, output: 80, total: 120, cost: 0.04, currency: "USD" }, 4);
    const saved = await saveSvgVersion(saveArgs(shared));
    expect(saved.ok && saved.sidecar.versions[0].cost).toEqual({
      actual: null, estimated: 0.01, currency: "USD", pricing: PRICING_VERSION, basis: "batch-split",
    });
    expect(saved.ok && costLabel(saved.sidecar.versions[0].cost)).toBe("$0.0100 Estimated");
  });

  it("calculates from the rate card only when no cost was reported at all", async () => {
    const tokens = { input: 100_000, output: 20_000, total: 120_000, cost: null, currency: "USD" };
    const saved = await saveSvgVersion(saveArgs(tokens));
    expect(saved.ok && saved.sidecar.versions[0].cost.basis).toBe("rate-card");
    expect(saved.ok && saved.sidecar.versions[0].cost.estimated).toBeCloseTo(0.42, 6);
    const unknown = await saveSvgVersion({ ...saveArgs(tokens), model: "someone/unknown", source: { ...source, id: "pair_x" } });
    expect(unknown.ok && unknown.sidecar.versions[0].cost).toEqual({
      actual: null, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "none",
    });
  });

  it("records what a failed attempt cost when the provider still answered", () => {
    const rec = recordFailure({
      source, prompt: "p", provider: "Requesty", model: DEFAULT_CONFIG.model,
      requestedAt: "2026-10-01T10:00:00.000Z", error: "invalid SVG: unsafe <script> element",
      sidecar: null, usage: allocateUsage({ input: 40, output: 80, total: 120, cost: 0.04, currency: "USD" }, 4),
    });
    expect(rec.cost).toEqual({ actual: null, estimated: 0.01, currency: "USD", pricing: PRICING_VERSION, basis: "batch-split" });
    expect(rec.usage).toEqual({ input: 10, output: 20, total: 30 });
  });

  it("reads a sidecar written before costs were recorded without breaking a row", () => {
    const legacy = JSON.stringify({
      v: 1,
      source: { relPath: source.relPath, name: source.name, fingerprint: source.fingerprint },
      versions: [{
        version: 1, svgPath: "architecture/fog_AI.svg", status: "generated", review: "pending",
        prompt: "p", provider: "Requesty", model: DEFAULT_CONFIG.model,
        requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
        usage: { input: 5, output: 6, total: 11 },
        validation: { ok: true, errors: [], warnings: [], icons: 1 },
      }],
    });
    const parsed = parseSidecar(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const row = toRow(source, parsed.sidecar, false);
    expect(row.newest).not.toBeNull();
    expect(row.newest?.cost).toEqual(NO_COST);
    expect(costLabel(row.newest?.cost ?? NO_COST)).toBe("no cost reported");
    expect(toListRow(row).cost).toBeNull();
    expect(toListRow(row).costEstimated).toBe(false);

    // The old cost shape (no basis, nullable pricing) is read back faithfully:
    // a number one can see is inferred as provider-reported, a calculation as a
    // split — the basis is never faked, and the missing pricing note stays empty.
    const withOldCost = (cost: string) => legacy.replace('"usage"', `"cost": ${cost}, "usage"`);
    const reported = parseSidecar(withOldCost('{ "actual": 0.02, "estimated": null, "currency": "USD", "pricing": null }'));
    expect(reported.ok && reported.sidecar.versions[0].cost)
      .toEqual({ actual: 0.02, estimated: null, currency: "USD", pricing: "", basis: "provider" });
    const split = parseSidecar(withOldCost('{ "actual": null, "estimated": 0.02, "currency": "USD", "pricing": null }'));
    expect(split.ok && split.sidecar.versions[0].cost.basis).toBe("batch-split");
    expect(split.ok && costLabel(split.sidecar.versions[0].cost)).toBe("$0.0200 Estimated");
    const empty = parseSidecar(withOldCost('{ "actual": null, "estimated": null }'));
    expect(empty.ok && empty.sidecar.versions[0].cost).toEqual(NO_COST);
  });
});

describe("runGeneration request budget (reasoning effort)", () => {
  it("splits medium effort into the observed two-image requests", async () => {
    stubCanvas();
    const selected = [source, courtSource, keepSource];
    const answer = selected.map((s) => block(s.stem, "<path d=\"M2 2h20v20H2z\"/>")).join("\n");
    const { bodies } = stubFetchCapture(answer, { prompt_tokens: 40, completion_tokens: 80, total_tokens: 120, cost: 0.04, currency: "USD" });
    const sidecars = new Map();
    const summary = await runGeneration({
      root: root(), apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 4, retries: 0 },
      caps: capsFor(DEFAULT_CONFIG.model), params: { ...DEFAULT_PARAMS, effort: "medium" },
      prompt: "p", sources: selected, sidecars, signal: new AbortController().signal, onEvent: () => undefined,
    });
    expect(summary.saved).toBe(3);
    expect(summary.batches).toBe(2);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].max_completion_tokens).toBe(64_000);
    expect(bodies[0].reasoning_effort).toBe("medium");
  });

  it("uses one image per high-effort request, matching the observed safe batch size", async () => {
    stubCanvas();
    const all = [source, courtSource, keepSource, laneSource];
    const answer = all.map((s) => block(s.stem, "<path d=\"M2 2h20v20H2z\"/>")).join("\n");
    const { bodies } = stubFetchCapture(answer, { prompt_tokens: 40, completion_tokens: 80, total_tokens: 120, cost: 0.04, currency: "USD" });
    const sidecars = new Map();
    const summary = await runGeneration({
      root: root(), apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 4, retries: 0 },
      caps: capsFor(DEFAULT_CONFIG.model), params: { ...DEFAULT_PARAMS, effort: "high" },
      prompt: "p", sources: all, sidecars, signal: new AbortController().signal, onEvent: () => undefined,
    });
    expect(summary.saved).toBe(4);
    // A high-effort request carries one image; the four-image selection is 1+1+1+1.
    expect(bodies).toHaveLength(4);
    expect(summary.batches).toBe(4);
    expect(bodies[0].max_completion_tokens).toBe(128_000);
  });

  it("fails a cut-off answer as a budget problem, not as a missing icon", async () => {
    stubCanvas();
    const cut = { choices: [{ message: { content: block("fog_AI", "<path d=\"M2 2h20v20H2z\"/>") }, finish_reason: "length" }], usage: { prompt_tokens: 900, completion_tokens: 32_000, total_tokens: 32_900 } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cut), { status: 200, headers: { "content-type": "application/json" } })));
    const sidecars = new Map();
    const problems: string[] = [];
    const summary = await runGeneration({
      root: root(), apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 1, retries: 0 },
      caps: capsFor(DEFAULT_CONFIG.model), params: { ...DEFAULT_PARAMS, effort: "medium" },
      prompt: "p", sources: [source], sidecars, signal: new AbortController().signal,
      onEvent: (e) => { if (e.kind === "item-failed") problems.push(e.error); },
    });
    expect(summary.saved).toBe(0);
    expect(summary.usage.total).toBe(32_900);
    expect(problems).toEqual([TRUNCATED_MESSAGE]);
  });

  it("records a lost terminal event as interrupted, preserves the old SVG, and does not resend", async () => {
    stubCanvas();
    const dir = root();
    const previous = await saveSvgVersion({ ...saveArgs(), root: dir });
    if (!previous.ok) throw new Error("fixture SVG should save");
    await saveSidecar(dir, source, previous.sidecar);
    const arch = await dir.getDirectoryHandle("architecture");
    const svgHandle = await arch.getFileHandle("fog_AI.svg");
    const before = await (await svgHandle.getFile()).text();
    const partial = `data: ${JSON.stringify({ choices: [{ delta: { content: "<svg>partial" }, finish_reason: null }] })}\n\n`;
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(partial)); controller.close(); },
    }), { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req_lost_done" } }));
    vi.stubGlobal("fetch", fetch);
    const sidecars = new Map([[source.id, previous.sidecar]]);
    const events: RunEvent[] = [];
    const summary = await runGeneration({
      root: dir, apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 4, retries: 2 },
      caps: capsFor(DEFAULT_CONFIG.model), params: { ...DEFAULT_PARAMS, effort: "high" },
      prompt: "p", sources: [source], sidecars, signal: new AbortController().signal, onEvent: (event) => events.push(event),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ saved: 0, failed: 1, uncertain: 1, batches: 1 });
    expect(events.find((event) => event.kind === "request-failed")).toMatchObject({
      kind: "request-failed", requestId: "req_lost_done", outcome: "unknown", count: 1,
    });
    const attempts = sidecars.get(source.id)?.versions ?? [];
    expect(attempts.map((v) => v.status)).toEqual(["generated", "interrupted"]);
    expect(attempts[1]).toMatchObject({ requestId: "req_lost_done", completedAt: null });
    expect(attempts[1].error).toContain("outcome unknown");
    expect(attempts[1].error).toContain("not retried");
    expect(summary.problems[0]).toContain("req_lost_done");
    expect(await (await (await arch.getFileHandle("fog_AI.svg")).getFile()).text()).toBe(before);
  });

  it("retries a confirmed terminal 429 only after that response, then saves the next attempt", async () => {
    stubCanvas();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429, headers: { "content-type": "application/json", "retry-after": "0" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: block("fog_AI", '<path d="M2 2h20v20H2z"/>') }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }), {
        status: 200, headers: { "content-type": "application/json", "x-request-id": "req_after_limit" },
      }));
    vi.stubGlobal("fetch", fetch);
    const sidecars = new Map();
    const summary = await runGeneration({
      root: root(), apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 1, retries: 1 },
      caps: capsFor(DEFAULT_CONFIG.model), params: DEFAULT_PARAMS, prompt: "p", sources: [source], sidecars,
      signal: new AbortController().signal, onEvent: () => undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ saved: 1, failed: 0, uncertain: 0 });
    expect(sidecars.get(source.id)?.versions[0].requestId).toBe("req_after_limit");
  });

  it("keeps a confirmed 429 as the result when the user aborts during its retry delay", async () => {
    stubCanvas();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "0.05", "x-request-id": "req_rate_limited" },
    }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    const sidecars = new Map();
    const summary = await runGeneration({
      root: root(), apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 1, retries: 2 },
      caps: capsFor(DEFAULT_CONFIG.model), params: DEFAULT_PARAMS, prompt: "p", sources: [source], sidecars,
      signal: controller.signal, onEvent: () => undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ saved: 0, failed: 1, uncertain: 0, cancelled: true });
    expect(sidecars.get(source.id)?.versions[0]).toMatchObject({ status: "failed", requestId: "req_rate_limited" });
    expect(sidecars.get(source.id)?.versions[0].error).toContain("retry after 1 s");
    expect(sidecars.get(source.id)?.versions[0].completedAt).not.toBeNull();
  });

  it("persists one uncertain upstream timeout to every item without retrying", async () => {
    stubCanvas();
    const privatePrompt = "A private prompt long enough to redact";
    const apiKey = "private-secret-value";
    const diagnostics = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: `upstream timed out for architecture/fog_AI.png: ${privatePrompt}; key ${apiKey}` } }), {
      status: 503, headers: { "content-type": "application/json", "x-request-id": "req_batch_timeout" },
    }));
    vi.stubGlobal("fetch", fetch);
    const sidecars = new Map();
    const events: RunEvent[] = [];
    const summary = await runGeneration({
      root: root(), apiKey, config: { ...DEFAULT_CONFIG, imagesPerRequest: 2, retries: 2 },
      caps: capsFor(DEFAULT_CONFIG.model), params: { ...DEFAULT_PARAMS, effort: "medium" },
      prompt: privatePrompt, sources: [source, courtSource], sidecars,
      signal: new AbortController().signal, onEvent: (event) => events.push(event),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ saved: 0, failed: 1, uncertain: 1, batches: 1 });
    expect(events.find((event) => event.kind === "request-failed")).toMatchObject({ kind: "request-failed", failure: "timeout", count: 2, requestId: "req_batch_timeout", outcome: "unknown" });
    for (const item of [source, courtSource]) {
      expect(sidecars.get(item.id)?.versions[0]).toMatchObject({ status: "interrupted", requestId: "req_batch_timeout", completedAt: null });
      expect(sidecars.get(item.id)?.versions[0].error).toContain("not retried");
    }
    const safeLog = diagnostics.mock.calls.map(([, record]) => String(record)).join(" ");
    expect(safeLog).toContain("upstream timed out");
    expect(safeLog).toContain("[prompt omitted]");
    expect(safeLog).toContain("[source]");
    for (const privateValue of [privatePrompt, "architecture/fog_AI.png", apiKey]) {
      expect(safeLog).not.toContain(privateValue);
      expect(summary.problems.join(" ")).not.toContain(privateValue);
    }
  });
});

describe("runGeneration cost plumbing", () => {
  it("stores exactly the cost the response reported for a single-image request", async () => {
    stubCanvas();
    const diagnostics = vi.spyOn(console, "info").mockImplementation(() => undefined);
    stubFetch(block("fog_AI", "<path d=\"M2 2h20v20H2z\"/>"), { prompt_tokens: 1000, completion_tokens: 2000, total_tokens: 3000, cost: 0.06, currency: "USD" });
    const dir = root();
    const sidecars = new Map();
    const summary = await runGeneration({
      root: dir, apiKey: "private-secret-value", config: { ...DEFAULT_CONFIG, imagesPerRequest: 1, retries: 0 },
      caps: capsFor(DEFAULT_CONFIG.model), params: DEFAULT_PARAMS,
      prompt: "PRIVATE_PROMPT_SHOULD_NOT_LOG", sources: [source], sidecars, signal: new AbortController().signal, onEvent: () => undefined,
    });
    expect(summary.saved).toBe(1);
    const stored = sidecars.get(source.id);
    const version = stored?.versions[0];
    expect(version?.usage).toEqual({ input: 1000, output: 2000, total: 3000 });
    expect(version?.requestId).toBe("req_1");
    expect(version?.requestedAt).not.toBe("");
    expect(version?.completedAt).not.toBeNull();
    expect(version?.cost).toEqual({
      actual: 0.06, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "provider",
    });
    const records = diagnostics.mock.calls.map(([, record]) => JSON.parse(String(record)) as Record<string, unknown>);
    expect(records.map((record) => record.kind)).toEqual(["request", "svg-parse", "save"]);
    expect(records[0]).toMatchObject({ kind: "request", requestId: "req_1", status: 200, outcome: "complete", inputTokens: 1000, outputTokens: 2000 });
    expect(records[1]).toMatchObject({ kind: "svg-parse", blocks: 1, matched: 1 });
    expect(records[1].durationMs).toBeGreaterThanOrEqual(0);
    expect(records[2]).toMatchObject({ kind: "save", position: 1, outcome: "saved" });
    expect(records[2].durationMs).toBeGreaterThanOrEqual(0);
    expect(records[2].sidecarMs).toBeGreaterThanOrEqual(0);
    const safeLog = JSON.stringify(records);
    expect(safeLog).not.toContain("PRIVATE_PROMPT_SHOULD_NOT_LOG");
    expect(safeLog).not.toContain("private-secret-value");
    expect(safeLog).not.toContain("architecture/fog_AI.png");
    // the number on disk is the number the request reported
    const reloaded = await loadSidecar(dir, source);
    expect(reloaded.sidecar?.versions[0].cost.actual).toBe(0.06);
  });

  it("splits one batch total across its images and still charges the invalid one", async () => {
    stubCanvas();
    stubFetch(
      block("fog_AI", "<path d=\"M2 2h20v20H2z\"/>") + "\n" + block("court_AI", "<script>x</script><path d=\"M2 2h20v20H2z\"/>"),
      { prompt_tokens: 40, completion_tokens: 80, total_tokens: 120, cost: 0.04, currency: "USD" },
    );
    const dir = root();
    const court: SvgSource = { ...source, id: "pair_court", name: "court_AI.png", stem: "court_AI", relPath: "architecture/court_AI.png" };
    const sidecars = new Map();
    const summary = await runGeneration({
      root: dir, apiKey: "key", config: { ...DEFAULT_CONFIG, imagesPerRequest: 2, retries: 0 },
      caps: capsFor(DEFAULT_CONFIG.model), params: DEFAULT_PARAMS,
      prompt: "p", sources: [source, court], sidecars, signal: new AbortController().signal, onEvent: () => undefined,
    });
    expect(summary.saved).toBe(1);
    expect(summary.invalid).toBe(1);
    const paid = sidecars.get(source.id)?.versions[0];
    const failed = sidecars.get(court.id)?.versions[0];
    expect(paid?.cost.basis).toBe("batch-split");
    expect(paid?.cost.estimated).toBeCloseTo(0.02, 8);
    expect(failed?.status).toBe("failed");
    expect(failed?.cost.estimated).toBeCloseTo(0.02, 8);
    expect(failed?.usage.total).toBe(60);
  });
});
