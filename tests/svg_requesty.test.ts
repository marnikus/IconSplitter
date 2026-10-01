import { describe, expect, it, vi } from "vitest";
import { callRequesty, buildRequestPayload, REQUESTY_MODEL_INFO } from "../src/svg/requesty";
import { DEFAULT_SVG_PREFERENCES } from "../src/svg/prefs";
import { manifestItem } from "./helpers/svgfixtures";

const key = "rq_live_abcdefghijklmnopqrstuvwxyz";
const manifest = [manifestItem()];
const config = { baseUrl: DEFAULT_SVG_PREFERENCES.baseUrl, model: DEFAULT_SVG_PREFERENCES.model,
  timeoutMs: 1000, rateLimitRetries: 0, maxOutputTokens: 2048 };
const input = { config, key, manifest, prompt: "draw an exact icon", compositeDataUrl: "data:image/png;base64,cG5n" };
const payloadResponse = { choices: [{ message: { content: "{\"icons\":[]}" } }],
  usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60, cost: 0.0025 } };

describe("Requesty multimodal Chat Completions", () => {
  it("builds a structured multimodal JSON body without placing the key in the body", () => {
    const body = buildRequestPayload(input);
    const serialized = JSON.stringify(body);
    expect(body).toMatchObject({ model: config.model, max_tokens: 2048 });
    expect(serialized).toContain('"type":"image_url"');
    expect(serialized).toContain(input.compositeDataUrl);
    expect(serialized).toContain("position_id");
    expect(serialized).not.toContain(key);
    expect(REQUESTY_MODEL_INFO.id).toBe(DEFAULT_SVG_PREFERENCES.model);
  });

  it("sends only to Requesty's endpoint with a Bearer header and reports provider usage", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payloadResponse), {
      status: 200, headers: { "content-type": "application/json", "x-request-id": "request-provider-1" },
    }));
    const result = await callRequesty(input, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://router.requesty.ai/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${key}` });
    expect((init as RequestInit).body).not.toContain(key);
    expect(result).toMatchObject({ kind: "success", requestId: "request-provider-1",
      usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, actualCostUsd: 0.0025 } });
  });

  it("rejects any endpoint outside the fixed Requesty host before sending credentials", async () => {
    const fetcher = vi.fn();
    const result = await callRequesty({ ...input, config: { ...config, baseUrl: "https://evil.example/v1" } }, fetcher as typeof fetch);
    expect(result).toMatchObject({ kind: "failed", status: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries only bounded HTTP 429 responses when explicitly enabled", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0.001" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payloadResponse), { status: 200 }));
    const result = await callRequesty({ ...input, config: { ...config, rateLimitRetries: 1 } }, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe("success");
  });

  it("does not resend when retry is disabled or Retry-After exceeds the bounded window", async () => {
    const stopped = vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }));
    const result = await callRequesty({ ...input, config: { ...config, rateLimitRetries: 2 } }, stopped as typeof fetch);
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "failed", status: 429 });

    const disabled = vi.fn(async () => new Response("{}", { status: 429 }));
    await callRequesty(input, disabled as typeof fetch);
    expect(disabled).toHaveBeenCalledTimes(1);
  });

  it.each([424, 499, 502, 503, 504, 529, 500])("marks HTTP %s as uncertain and never retries it", async (status) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: key } }), { status }));
    const result = await callRequesty({ ...input, config: { ...config, rateLimitRetries: 3 } }, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "unknown", status });
    if (result.kind === "unknown") expect(result.safeError).not.toContain(key);
  });

  it("treats connection loss, timeout and malformed 200 responses as unknown", async () => {
    const lost = await callRequesty(input, vi.fn(async () => { throw new Error(`network ${key}`); }) as typeof fetch);
    expect(lost).toMatchObject({ kind: "unknown", status: null });
    if (lost.kind === "unknown") expect(lost.safeError).not.toContain(key);

    const timeoutFetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const timeout = await callRequesty({ ...input, config: { ...config, timeoutMs: 1 } }, timeoutFetch as typeof fetch);
    expect(timeout).toMatchObject({ kind: "unknown", status: null });

    const malformed = await callRequesty(input, vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch);
    expect(malformed).toMatchObject({ kind: "unknown", status: 200 });
  });

  it.each([400, 401, 402, 403, 404, 412, 413])("reports definite Requesty HTTP %s errors without exposing response bodies", async (status) => {
    const result = await callRequesty(input, vi.fn(async () => new Response(`secret ${key}`, { status })) as typeof fetch);
    expect(result).toMatchObject({ kind: "failed", status });
    if (result.kind === "failed") expect(result.safeError).not.toContain(key);
  });
});
