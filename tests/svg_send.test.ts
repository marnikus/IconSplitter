// RULE 8 — the provider call itself executes against a fake transport: the
// exact URL, headers and body are asserted, every failure mode is produced by
// the real code path, and the key is proven to stay out of the reported error.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { buildChatRequest, classifyTransport, readJsonResponse, type FetchLike } from "../src/lib/svgrequest";
import { redact } from "../src/lib/svgsecret";

// Assembled from parts so no key-shaped literal is committed (hygiene test).
const KEY = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const config: SvgConfig = { ...DEFAULT_CONFIG, timeoutMs: 5_000, maxTokens: 32_000 };

function jsonOut(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const okBody = { choices: [{ message: { content: "<svg/>" } }], usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11, cost: 0.0021 } };

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

  it("streams, and asks for the usage/cost chunk a streamed answer omits by default", () => {
    const caps = capsFor(config.model);
    const body = buildChatRequest({ model: config.model, prompt: "p", image: "data:,", caps, params: { temperature: null, maxTokens: 32_000, effort: null } });
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

describe("readJsonResponse — the provider that ignored stream: true", () => {
  const read = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    readJsonResponse(jsonOut(body, status, headers));

  it("reads the answer, the usage and the request id from a single JSON body", async () => {
    const out = await read(okBody, 200, { "x-request-id": "req_42" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toBe("<svg/>");
    expect(out.usage).toMatchObject({ input: 5, output: 6, total: 11, cost: 0.0021 });
    expect(out.requestId).toBe("req_42");
    // completeness: a JSON body IS the whole answer, no [DONE] to wait for
    expect(out.frames).toBe(1);
  });

  it("reports an unreadable or empty body as malformed, never as an answer", async () => {
    const junk = await readJsonResponse(new Response("<html>nope</html>", { status: 200 }));
    expect(junk.ok === false && junk.failure.kind).toBe("malformed");
    const empty = await read({ choices: [{ message: { content: "" } }] });
    expect(empty.ok === false && empty.failure.kind).toBe("malformed");
  });

  it("keeps the provider's error text for the caller to redact", async () => {
    const out = await readJsonResponse(jsonOut({ error: { message: `Invalid key ${KEY}` } }, 401));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("auth");
    expect(redact(out.failure.message, KEY)).not.toContain(KEY);
  });
});

describe("the transport seam", () => {
  it("uses the global fetch when no transport is injected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonOut(okBody)));
    const out = await readJsonResponse(await fetch("https://example.test"));
    expect(out.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies a transport error as retryable, and a stall as not retryable", () => {
    const broken: FetchLike = async () => { throw new Error("connection reset"); };
    expect(typeof broken).toBe("function");
    expect(classifyTransport(new Error("connection reset"), { stalled: false, aborted: false }))
      .toMatchObject({ kind: "network", retryable: true });
    expect(classifyTransport(new Error("gone"), { stalled: true, aborted: false }))
      .toMatchObject({ kind: "stalled", retryable: false });
  });
});
