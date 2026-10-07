// RULE 8 — the Gemini client runs for real against a fake transport: the
// verified endpoint/model, the x-goog-api-key auth header, the camelCase
// inlineData request body, the response readers, failure classification, and
// the single-attempt send (timeout/cancel included). Keys never appear in
// URLs; disconnects/timeouts are never auto-retryable (design §5).
import { describe, expect, it } from "vitest";
import {
  AUTH_HEADER,
  DEFAULT_BASE_URL,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_MODEL,
  buildGeminiRequest,
  classifyGeminiHttp,
  classifyGeminiTransport,
  generateContentUrl,
  parseGeminiConfig,
  readGeminiBlock,
  readGeminiText,
  readGeminiUsage,
  sendGemini,
  serializeGeminiConfig,
  type FetchLike,
  type GeminiConfig,
} from "../src/lib/geminiclient";

const API_KEY = "test-key-123";
const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const PROMPT = "describe this icon";

function config(over: Partial<GeminiConfig> = {}): GeminiConfig {
  return { ...DEFAULT_GEMINI_CONFIG, ...over };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

const okBody = {
  candidates: [{ content: { parts: [{ text: "Title: a\nDescription: b\nTags: c" }] } }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 },
};

describe("config + URL", () => {
  it("builds the generateContent URL from base + model", () => {
    expect(generateContentUrl(DEFAULT_BASE_URL, DEFAULT_MODEL))
      .toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    expect(generateContentUrl("https://example.com/v1beta/", "m")).toBe("https://example.com/v1beta/models/m:generateContent");
  });

  it("parses a stored payload tolerantly and round-trips", () => {
    const parsed = parseGeminiConfig({ baseUrl: "https://x.test/", model: "my-model", timeoutMs: 1, retries: 99, concurrency: 0 });
    expect(parsed.baseUrl).toBe("https://x.test/");
    expect(parsed.model).toBe("my-model");
    expect(parsed.timeoutMs).toBe(5_000); // clamped to the minimum
    expect(parsed.retries).toBe(5); // clamped to the maximum
    expect(parsed.concurrency).toBe(1);
    expect(parseGeminiConfig(null)).toEqual(DEFAULT_GEMINI_CONFIG);
    expect(parseGeminiConfig(JSON.parse(serializeGeminiConfig(parsed)))).toEqual(parsed);
  });
});

describe("buildGeminiRequest — the verified wire shape", () => {
  it("sends text + camelCase inlineData with the data-URL mime type", () => {
    const req = buildGeminiRequest(PROMPT, IMAGE);
    expect(req.contents).toHaveLength(1);
    expect(req.contents[0].role).toBe("user");
    expect(req.contents[0].parts[0]).toEqual({ text: PROMPT });
    expect(req.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" } });
  });

  it("rejects a non-data-URL image", () => {
    expect(() => buildGeminiRequest(PROMPT, "https://x.test/icon.jpg")).toThrow();
  });
});

describe("response readers", () => {
  it("reads the answer text, joining parts", () => {
    expect(readGeminiText({ candidates: [{ content: { parts: [{ text: "Hello " }, { text: "world" }] } }] }))
      .toBe("Hello world");
    expect(readGeminiText({ candidates: [] })).toBeNull();
    expect(readGeminiText({ candidates: [{ content: { parts: [] } }] })).toBeNull();
    expect(readGeminiText({})).toBeNull();
  });

  it("reads usageMetadata token counts, never inventing numbers", () => {
    expect(readGeminiUsage(okBody)).toEqual({ input: 11, output: 22, total: 33 });
    expect(readGeminiUsage({})).toEqual({ input: null, output: null, total: null });
  });

  it("reads refusals from promptFeedback.blockReason and finishReason", () => {
    expect(readGeminiBlock({ promptFeedback: { blockReason: "SAFETY" } })).toBe("SAFETY");
    expect(readGeminiBlock({ candidates: [{ finishReason: "SAFETY" }] })).toBe("SAFETY");
    expect(readGeminiBlock({ promptFeedback: { blockReason: "BLOCK_REASON_UNSPECIFIED" } })).toBeNull();
    expect(readGeminiBlock(okBody)).toBeNull();
  });
});

describe("failure classification", () => {
  it("maps HTTP statuses; only provider-confirmed failures are retryable", () => {
    expect(classifyGeminiHttp(401, {}, null).kind).toBe("auth");
    expect(classifyGeminiHttp(403, {}, null).retryable).toBe(false);
    expect(classifyGeminiHttp(429, { error: { message: "quota" } }, 1000)).toMatchObject({ kind: "rate_limit", retryable: true, retryAfterMs: 1000 });
    expect(classifyGeminiHttp(404, {}, null).kind).toBe("model");
    expect(classifyGeminiHttp(400, {}, null).kind).toBe("payload");
    expect(classifyGeminiHttp(500, {}, null)).toMatchObject({ kind: "provider", retryable: true });
    expect(classifyGeminiHttp(504, {}, null)).toMatchObject({ kind: "provider_timeout", retryable: false });
    expect(classifyGeminiHttp(418, {}, null).kind).toBe("malformed");
  });

  it("uses the error body message, never the raw body", () => {
    const f = classifyGeminiHttp(429, { error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }, null);
    expect(f.message).toContain("Resource exhausted");
  });

  it("treats disconnect, timeout and cancel as never auto-retryable", () => {
    expect(classifyGeminiTransport(new TypeError("fetch failed"), { cancelled: false, timedOut: false }))
      .toMatchObject({ kind: "network", retryable: false });
    expect(classifyGeminiTransport(new Error("x"), { cancelled: false, timedOut: true }))
      .toMatchObject({ kind: "timeout", retryable: false });
    expect(classifyGeminiTransport(new Error("x"), { cancelled: true, timedOut: false }))
      .toMatchObject({ kind: "aborted", retryable: false });
  });
});

describe("sendGemini — one real attempt over an injectable transport", () => {
  it("POSTs with the auth header and returns text + usage", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fake: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return jsonResponse(200, okBody);
    };
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain("Title:");
      expect(out.usage).toEqual({ input: 11, output: 22, total: 33 });
    }
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(generateContentUrl(DEFAULT_BASE_URL, DEFAULT_MODEL));
    expect(seen[0].init.method).toBe("POST");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers[AUTH_HEADER]).toBe(API_KEY); // header auth, never ?key=
    expect(headers["content-type"]).toBe("application/json");
    expect(seen[0].url).not.toContain(API_KEY);
    expect(JSON.parse(seen[0].init.body as string)).toEqual(buildGeminiRequest(PROMPT, IMAGE));
  });

  it("classifies an HTTP error with retry-after", async () => {
    const fake: FetchLike = async () => ({
      ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }),
      headers: { get: (name: string) => (name === "retry-after" ? "7" : null) },
    } as unknown as Response);
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure).toMatchObject({ kind: "rate_limit", retryable: true, retryAfterMs: 7000, status: 429 });
      expect(out.failure.message).toContain("quota");
    }
  });

  it("reports a refusal as blocked, never retryable", async () => {
    const fake: FetchLike = async () => jsonResponse(200, { promptFeedback: { blockReason: "SAFETY" } });
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ kind: "blocked", retryable: false });
  });

  it("reports an answerless 200 as malformed", async () => {
    const fake: FetchLike = async () => jsonResponse(200, { candidates: [] });
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("malformed");
  });

  it("classifies a network failure as not auto-retryable (paid call)", async () => {
    const fake: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ kind: "network", retryable: false });
  });

  it("classifies a client timeout as outcome-unknown, never retryable", async () => {
    const fake: FetchLike = (_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
    const out = await sendGemini({ config: config({ timeoutMs: 5 }), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ kind: "timeout", retryable: false });
  });

  it("classifies a caller cancel as aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake: FetchLike = (_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      setTimeout(() => reject(new Error("aborted")), 1);
    });
    const out = await sendGemini({ config: config(), apiKey: API_KEY, request: buildGeminiRequest(PROMPT, IMAGE), fetch: fake, signal: controller.signal });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("aborted");
  });
});
