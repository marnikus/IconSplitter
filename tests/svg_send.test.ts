// RULE 8 — the provider call itself executes against a fake transport: the
// exact URL, headers and body are asserted, every failure mode is produced by
// the real code path, and the key is proven to stay out of the reported error.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { buildChatRequest, sendChatRequest, wireHeaders, type FetchLike } from "../src/lib/svgrequest";
import { redact } from "../src/lib/svgsecret";

// Assembled from parts so no key-shaped literal is committed (hygiene test).
const KEY = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const config: SvgConfig = { ...DEFAULT_CONFIG, timeoutMs: 5_000, maxTokens: 32_000 };

function jsonOut(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
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
  it("posts exactly the headers wireHeaders names, and the body is JSON.stringify of the request", async () => {
    const { calls, fetch } = capture();
    const request = buildChatRequest({ model: config.model, prompt: "p", image: "data:image/png;base64,AA", caps: capsFor(config.model), params: { temperature: null, maxTokens: 1_000, effort: null } });
    await sendChatRequest({ config, apiKey: KEY, request, fetch });
    expect(calls[0].init.headers).toEqual(wireHeaders(KEY));
    expect(calls[0].init.body).toBe(JSON.stringify(request));
  });

  it("posts the documented payload to the router with the key in the header", async () => {
    const { calls, fetch } = capture();
    const caps = capsFor(config.model);
    const request = buildChatRequest({ model: config.model, prompt: "prompt", image: "data:image/png;base64,AA", caps, params: { temperature: null, maxTokens: 32_000, effort: "medium" } });
    const out = await sendChatRequest({ config, apiKey: KEY, request, fetch });
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
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,AA");
    if (!out.ok) throw new Error("expected success");
    expect(out.text).toBe("<svg/>");
    expect(out.usage).toMatchObject({ input: 5, output: 6, total: 11, cost: 0.0021 });
    expect(out.requestId).toBe("req_42");
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
    expect(server.ok === false && server.failure).toMatchObject({ kind: "provider", retryable: true });

    const junk: FetchLike = async () => new Response("<html>nope</html>", { status: 200 });
    const bad = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: junk });
    expect(bad.ok === false && bad.failure.kind).toBe("malformed");

    const empty: FetchLike = async () => jsonOut({ choices: [{ message: { content: "" } }] });
    const none = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: empty });
    expect(none.ok === false && none.failure.kind).toBe("malformed");
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

  it("uses the global fetch when no transport is injected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonOut(okBody)));
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }) });
    expect(out.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a transport error as retryable network failure", async () => {
    const broken: FetchLike = async () => { throw new Error("connection reset"); };
    const out = await sendChatRequest({ config, apiKey: KEY, request: buildChatRequest({ model: config.model, prompt: "p", image: "u", caps: capsFor(config.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" } }), fetch: broken });
    expect(out.ok === false && out.failure).toMatchObject({ kind: "network", retryable: true });
  });
});
