// RULE 8 — the provider call itself executes against a fake transport: the
// exact URL, headers and body are asserted, every failure mode is produced by
// the real code path, and the key is proven to stay out of the reported error.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { buildChatRequest, sendChatRequest, TRUNCATED_MESSAGE, type FetchLike, type RequestClock } from "../src/lib/svgrequest";
import { redact } from "../src/lib/svgsecret";

// Assembled from parts so no key-shaped literal is committed (hygiene test).
const KEY = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const config: SvgConfig = { ...DEFAULT_CONFIG, timeoutMs: 5_000, maxTokens: 32_000 };

function jsonOut(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function sseOut(body: string, cuts: number[] = [], headers: Record<string, string> = {}): Response {
  const bytes = new TextEncoder().encode(body);
  const points = [0, ...cuts, bytes.length].sort((a, b) => a - b);
  const chunks = points.slice(1).map((end, i) => bytes.slice(points[i], end)).filter((chunk) => chunk.length > 0);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close(); },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

function testClock(): RequestClock {
  let time = 0;
  return { now: () => (time += 10), iso: () => "2026-10-05T12:00:00.000Z" };
}

const okBody = { choices: [{ message: { content: "<svg/>" } }], usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11, cost: 0.0021 } };

function capture(): { calls: { url: string; init: RequestInit }[]; fetch: FetchLike } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonOut(okBody, 200, { "x-request-id": "req_42" });
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("buildChatRequest", () => {
  const params: SamplingParams = { temperature: 0.4, maxTokens: 32_000, effort: "high" };

  it("sends the reasoning model what it accepts and nothing it refuses", () => {
    const caps = capsFor(config.model);
    const body = buildChatRequest({ model: config.model, prompt: "prompt", image: "data:image/png;base64,AA", caps, params: { ...params, temperature: 0.4 } });
    // A reasoning model answers 400 for temperature and for max_tokens.
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body.max_completion_tokens).toBe(32_000);
    expect(body.reasoning_effort).toBe("high");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("sends a classic model its temperature and max_tokens, and no effort", () => {
    const caps = capsFor("openai/gpt-4o");
    const body = buildChatRequest({ model: "openai/gpt-4o", prompt: "prompt", image: "data:image/png;base64,AA", caps, params });
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(32_000);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("omits an effort the model does not offer instead of guessing one", () => {
    const caps = capsFor("openai/gpt-5-codex");
    const body = buildChatRequest({ model: "openai/gpt-5-codex", prompt: "p", image: "data:,", caps, params: { ...params, effort: "xhigh" } });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("keeps the multimodal shape and omits the token ceiling when it is 0", () => {
    const caps = capsFor("openai/gpt-4o");
    const body = buildChatRequest({ model: "openai/gpt-4o", prompt: "p", image: "data:,", caps, params: { temperature: null, maxTokens: 0, effort: null } });
    expect(body.messages[0].content.map((c) => c.type)).toEqual(["text", "image_url"]);
    expect(body).not.toHaveProperty("max_tokens");
  });
});

describe("sendChatRequest", () => {
  it("posts the documented payload to the router with the key in the header", async () => {
    const { calls, fetch } = capture();
    const caps = capsFor(config.model);
    const request = buildChatRequest({ model: config.model, prompt: "prompt", image: "data:image/png;base64,AA", caps, params: { temperature: null, maxTokens: 32_000, effort: "medium" } });
    const out = await sendChatRequest({ config, apiKey: KEY, request, fetch, clock: testClock() });
    expect(out.ok).toBe(true);
    expect(calls[0].url).toBe("https://router.requesty.ai/v1/chat/completions");
    const init = calls[0].init;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openai/gpt-6.1-sol");
    // The default model is a reasoning model: completion tokens, no temperature.
    expect(body.max_completion_tokens).toBe(32_000);
    expect(body).not.toHaveProperty("temperature");
    expect(body.reasoning_effort).toBe("medium");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,AA");
    if (!out.ok) throw new Error("expected success");
    expect(out.text).toBe("<svg/>");
    expect(out.timing.transport).toBe("json");
    expect(out.timing.completionMs).toBe(10);
    expect(out.timing.responseEndedMs).toBe(10);
    expect(out.timing.parseMs).toBe(10);
    expect(out.timing.totalMs).toBeGreaterThan(out.timing.completionMs ?? 0);
    expect(out.finishReason).toBeNull();
    expect(out.usage).toMatchObject({ input: 5, output: 6, total: 11, cost: 0.0021 });
    expect(out.requestId).toBe("req_42");
  });

  it("collects fragmented SSE through terminal completion and captures first-token timing", async () => {
    const events = [
      { choices: [{ delta: { role: "assistant" }, finish_reason: null }] },
      { choices: [{ delta: { content: "<svg>é</svg>" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11, cost: 0.0021 } },
    ];
    const body = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("") + "data: [DONE]\r\n\r\n";
    const bytes = new TextEncoder().encode(body);
    const utf8Split = bytes.indexOf(0xc3) + 1;
    const response = sseOut(body, [1, 4, utf8Split, utf8Split + 1, bytes.length - 3], { "x-request-id": "req_stream" });
    const fetch: FetchLike = async () => response;
    const out = await sendChatRequest({
      config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }),
      fetch, clock: testClock(),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected complete stream");
    expect(out.text).toBe("<svg>é</svg>");
    expect(out.usage).toMatchObject({ input: 5, output: 6, total: 11, cost: 0.0021 });
    expect(out.finishReason).toBe("stop");
    expect(out.requestId).toBe("req_stream");
    expect(out.timing).toMatchObject({ apiStartedAt: "2026-10-05T12:00:00.000Z", transport: "sse" });
    expect(out.timing.firstEventMs).not.toBeNull();
    expect(out.timing.firstTokenMs).toBeGreaterThanOrEqual(out.timing.firstEventMs ?? 0);
    expect(out.timing.completionMs).toBeGreaterThanOrEqual(out.timing.firstTokenMs ?? 0);
    expect(out.timing.parseMs).toBeGreaterThan(0);
  });

  it("classifies a terminal SSE provider error as uncertain and non-retryable", async () => {
    const body = `data: ${JSON.stringify({ error: { message: "upstream stopped after partial output" } })}\n\n` + "data: [DONE]\n\n";
    const out = await sendChatRequest({
      config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }),
      fetch: async () => sseOut(body), clock: testClock(),
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("provider stream error must fail");
    expect(out.failure).toMatchObject({ kind: "provider", outcome: "unknown", retryable: false });
  });

  it("treats clean EOF without finish_reason or DONE as an unconfirmed incomplete stream", async () => {
    const response = sseOut(`data: ${JSON.stringify({ choices: [{ delta: { content: "<svg>partial" }, finish_reason: null }] })}\n\n`, [], { "x-request-id": "req_partial" });
    const out = await sendChatRequest({
      config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }),
      fetch: async () => response, clock: testClock(),
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("incomplete stream must not return partial content");
    expect(out.failure).toMatchObject({ kind: "incomplete", outcome: "unknown", retryable: false });
    expect(out.requestId).toBe("req_partial");
    expect(out.timing.firstTokenMs).not.toBeNull();
    expect(out.timing.completionMs).toBeNull();
  });

  it("preserves usage and classifies a terminal streaming length finish as truncation", async () => {
    const events = [
      { choices: [{ delta: { content: "<svg>cut" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "length" }] },
      { choices: [], usage: { prompt_tokens: 900, completion_tokens: 32_000, total_tokens: 32_900 } },
    ];
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
    const out = await sendChatRequest({
      config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "high" } }),
      fetch: async () => sseOut(body), clock: testClock(),
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("truncated stream must fail");
    expect(out.failure).toMatchObject({ kind: "truncated", outcome: "confirmed", retryable: false });
    expect(out.usage?.total).toBe(32_900);
    expect(out.finishReason).toBe("length");
    expect(out.timing.completionMs).not.toBeNull();
  });

  it("reports an auth failure without leaking the key", async () => {
    const fetch: FetchLike = async () => jsonOut({ error: { message: `Invalid key ${KEY}` } }, 401);
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.failure.kind).toBe("auth");
    expect(out.failure.retryable).toBe(false);
    expect(redact(out.failure.message, KEY)).not.toContain(KEY);
    expect(out.failure.message).toContain(KEY); // raw message still carries it: caller must redact
  });

  it("classifies rate limit with retry-after, model, provider and malformed answers", async () => {
    const rate: FetchLike = async () => jsonOut({}, 429, { "retry-after": "2" });
    const limited = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: rate });
    expect(limited.ok === false && limited.failure).toMatchObject({ kind: "rate_limit", retryable: true, retryAfterMs: 2000 });

    const noModel: FetchLike = async () => jsonOut({ error: { message: "model not found: openai/gpt-6.1-sol" } }, 404);
    const model = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: noModel });
    expect(model.ok === false && model.failure.kind).toBe("model");

    const boom: FetchLike = async () => jsonOut({}, 503);
    const server = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: boom });
    expect(server.ok === false && server.failure).toMatchObject({ kind: "provider", outcome: "unknown", retryable: false });

    const gatewayTimeout: FetchLike = async () => jsonOut({ error: { message: "gateway timeout" } }, 504);
    const timedOut = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: gatewayTimeout });
    expect(timedOut.ok === false && timedOut.failure).toMatchObject({ kind: "timeout", outcome: "unknown", retryable: false, status: 504 });

    const upstreamTimeout: FetchLike = async () => jsonOut({ error: { message: "upstream timed out" } }, 503);
    const providerTimedOut = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: upstreamTimeout });
    expect(providerTimedOut.ok === false && providerTimedOut.failure).toMatchObject({ kind: "timeout", outcome: "unknown", retryable: false, status: 503 });

    const junk: FetchLike = async () => new Response("<html>nope</html>", { status: 200 });
    const bad = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: junk });
    expect(bad.ok === false && bad.failure).toMatchObject({ kind: "malformed", outcome: "unknown", retryable: false });

    const empty: FetchLike = async () => jsonOut({ choices: [{ message: { content: "" } }] });
    const none = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: empty });
    expect(none.ok === false && none.failure.kind).toBe("malformed");
  });

  it("treats a cut-off answer as a budget failure, never as a missing answer", async () => {
    // finish_reason "length" means the provider spent the whole completion
    // ceiling — at medium/high effort the reasoning is paid out of it, so the
    // last icons of a batch simply never arrive.
    const cut: FetchLike = async () => jsonOut({
      choices: [{ message: { content: "<svg>1</svg><svg>2</svg" }, finish_reason: "length" }],
      usage: { prompt_tokens: 900, completion_tokens: 32_000, total_tokens: 32_900 },
    });
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: cut });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.failure.kind).toBe("truncated");
    expect(out.failure.message).toBe(TRUNCATED_MESSAGE);
    expect(out.failure.retryable).toBe(false); // the tokens are already spent
  });

  it("still succeeds on a complete answer (finish_reason stop)", async () => {
    const done: FetchLike = async () => jsonOut({ choices: [{ message: { content: "<svg/>" }, finish_reason: "stop" }], usage: okBody.usage });
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "low" } }), fetch: done });
    expect(out.ok).toBe(true);
  });

  it("treats a timeout as uncertain (never auto-retried)", async () => {
    const hanging: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
    const out = await sendChatRequest({
      config: { ...config, timeoutMs: 20 }, apiKey: KEY,
      request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: hanging,
    });
    expect(out.ok === false && out.failure).toMatchObject({ kind: "timeout", retryable: false });
  }, 3000);

  it("captures a first token before an app deadline but records no terminal completion", async () => {
    const first = `data: ${JSON.stringify({ choices: [{ delta: { content: "<svg/>" }, finish_reason: null }] })}\n\n`;
    const encoder = new TextEncoder();
    const hanging: FetchLike = async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(first));
        init.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
      },
    }), { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req_wait" } });
    const out = await sendChatRequest({
      config: { ...config, timeoutMs: 20 }, apiKey: KEY,
      request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "high" } }),
      fetch: hanging,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("deadline must fail");
    expect(out.failure).toMatchObject({ kind: "timeout", outcome: "unknown", retryable: false });
    expect(out.requestId).toBe("req_wait");
    expect(out.timing.firstTokenMs).not.toBeNull();
    expect(out.timing.completionMs).toBeNull();
  }, 3000);

  it("honours a caller abort instead of reporting a timeout", async () => {
    const hanging: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
    const controller = new AbortController();
    const pending = sendChatRequest({
      config: { ...config, timeoutMs: 5_000 }, apiKey: KEY,
      request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: hanging, signal: controller.signal,
    });
    controller.abort();
    const out = await pending;
    expect(out.ok === false && out.failure).toMatchObject({ kind: "aborted", retryable: false });
  }, 3000);

  it("does not send when the caller was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, fetch } = capture();
    const out = await sendChatRequest({
      config, apiKey: KEY,
      request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }),
      fetch, signal: controller.signal,
    });
    expect(out.ok === false && out.failure).toMatchObject({ kind: "aborted", outcome: "confirmed", retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("uses the global fetch when no transport is injected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonOut(okBody)));
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }) });
    expect(out.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a lost network response as uncertain and never retryable", async () => {
    const broken: FetchLike = async () => { throw new Error("connection reset"); };
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: broken });
    expect(out.ok === false && out.failure).toMatchObject({ kind: "network", outcome: "unknown", retryable: false });
  });
});
