// up_gemini.test.ts — the Gemini provider layer (prompt §7) executes against
// a FAKE transport (RULE 8): the exact documented request shape, every failure
// class named by the design, the never-auto-resubmit rule for unknown
// outcomes, the retry-after honouring, the estimated-only cost, and the
// redacted confirmation preview. Deleting gemconfig or geminireq fails every
// assertion here.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_CONFIG, GEMINI_STORAGE_KEY, RATE_CARD, RATE_CARD_VERSION,
  estimatedCostUsd, generateContentUrl, parseGeminiConfig, serializeGeminiConfig,
} from "../src/lib/gemconfig";
import {
  buildGeminiRequest, describeGeminiRequest, sendGeminiRequest, type GeminiFetch, type GeminiRequest,
} from "../src/lib/geminireq";

const CONFIG = DEFAULT_GEMINI_CONFIG;

describe("gemconfig — documented defaults, clamped on read", () => {
  it("keeps the documented defaults and storage key", () => {
    expect(CONFIG).toEqual({
      endpoint: "https://generativelanguage.googleapis.com",
      model: "gemini-3.1-flash-lite",
      timeoutS: 120, retries: 2, concurrency: 2,
    });
    expect(GEMINI_STORAGE_KEY).toBe("iconSplitter.upload.gemini.v1");
  });

  it("clamps every tunable on read (5-900 s, 0-5 retries, 1-4 concurrency)", () => {
    const c = parseGeminiConfig({ endpoint: "https://proxy.local", model: "gemini-3.1-flash", timeoutS: 3, retries: 9, concurrency: 0 });
    expect(c).toEqual({ endpoint: "https://proxy.local", model: "gemini-3.1-flash", timeoutS: 5, retries: 5, concurrency: 1 });
    const lo = parseGeminiConfig({ timeoutS: 10_000, retries: -1, concurrency: 99 });
    expect(lo.timeoutS).toBe(900);
    expect(lo.retries).toBe(0);
    expect(lo.concurrency).toBe(4);
  });

  it("falls back per field for junk instead of throwing", () => {
    expect(parseGeminiConfig(null)).toEqual(DEFAULT_GEMINI_CONFIG);
    expect(parseGeminiConfig({ endpoint: "ftp://nope", model: "" })).toEqual({ ...DEFAULT_GEMINI_CONFIG, timeoutS: 120, retries: 2, concurrency: 2 });
    expect(parseGeminiConfig("junk")).toEqual(DEFAULT_GEMINI_CONFIG);
  });

  it("round-trips through serialize/parse", () => {
    const stored = JSON.parse(serializeGeminiConfig({ endpoint: "https://e.example", model: "m-1", timeoutS: 300, retries: 1, concurrency: 3 }));
    const c = parseGeminiConfig(stored);
    expect(c).toEqual({ endpoint: "https://e.example", model: "m-1", timeoutS: 300, retries: 1, concurrency: 3 });
  });

  it("builds the documented generateContent URL", () => {
    expect(generateContentUrl(CONFIG.endpoint, CONFIG.model))
      .toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    expect(generateContentUrl("https://e.example/", "m/x"))
      .toBe("https://e.example/v1beta/models/m%2Fx:generateContent");
  });
});

describe("gemconfig — the versioned rate card (cost is always an estimate)", () => {
  it("prices tokens from the versioned card only", () => {
    expect(RATE_CARD_VERSION).toMatch(/gemini-3\.1-flash-lite/);
    expect(RATE_CARD.inputPerMToken).toBe(0.25);
    expect(RATE_CARD.outputPerMToken).toBe(1.5);
    expect(estimatedCostUsd({ input: 1_000_000, output: 1_000_000 })).toBeCloseTo(1.75, 10);
    expect(estimatedCostUsd({ input: 0, output: 0 })).toBe(0);
  });
});

const PROMPT = "Task: Analyze the icon image.";
const IMAGE = "aGVsbG8="; // "hello" in base64 — never decoded in these tests

describe("geminireq — the exact documented request", () => {
  it("builds the POST body: text + inline PNG, JSON mode, response schema", () => {
    const r = buildGeminiRequest({ config: CONFIG, apiKey: "KEY123", prompt: PROMPT, imageBase64: IMAGE });
    expect(r.url).toBe(generateContentUrl(CONFIG.endpoint, CONFIG.model));
    expect(r.headers["x-goog-api-key"]).toBe("KEY123");
    expect(r.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(r.body);
    expect(body.contents).toEqual([{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/png", data: IMAGE } }] }]);
    expect(body.generationConfig.response_mime_type).toBe("application/json");
    expect(body.generationConfig.response_schema.type).toBe("OBJECT");
    expect(body.generationConfig.response_schema.required).toEqual(["title", "description", "tags"]);
    expect(body.generationConfig.response_schema.properties.tags).toEqual({ type: "ARRAY", items: { type: "STRING" } });
  });

  it("shows the exact request in the dialog with the image and key redacted", () => {
    const r = buildGeminiRequest({ config: CONFIG, apiKey: "SECRET-KEY-9", prompt: PROMPT, imageBase64: IMAGE });
    const preview = describeGeminiRequest(r);
    expect(preview).toContain(generateContentUrl(CONFIG.endpoint, CONFIG.model));
    expect(preview).toContain(PROMPT);
    expect(preview).toContain("8"); // the length note
    expect(preview).not.toContain(IMAGE);
    expect(preview).not.toContain("SECRET-KEY-9");
    expect(preview).toContain("redacted");
  });
});

/** A transport returning a fixed JSON response. */
function okResponse(body: unknown, headers: Record<string, string> = {}): GeminiFetch {
  return async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function statusResponse(status: number, body: unknown, headers: Record<string, string> = {}): GeminiFetch {
  return async () => new Response(JSON.stringify(body), { status, headers });
}

function build(): GeminiRequest {
  return buildGeminiRequest({ config: CONFIG, apiKey: "KEY123", prompt: PROMPT, imageBase64: IMAGE });
}

const ANSWER = JSON.stringify({ title: "Growth And Speed. The Vector Icon", description: "An arrow rising quickly to show progress and success", tags: ["icon", "growth"] });

describe("geminireq — the verified happy path", () => {
  it("returns the answer text, reported tokens and the estimated cost", async () => {
    const body = {
      candidates: [{ content: { parts: [{ text: ANSWER }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
    };
    const out = await sendGeminiRequest({ request: build(), fetch: okResponse(body, { "x-goog-request-id": "req-7" }), timeoutMs: 1000 });
    expect(out).toMatchObject({
      ok: true, text: ANSWER, requestId: "req-7", finishReason: "STOP",
      usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
    });
    if (out.ok) expect(out.usage.estimatedCostUsd).toBeCloseTo(0.25 * 0.0012 + 1.5 * 0.0003, 12); // tokens, not M tokens
  });

  it("joins multi-part answers in order", async () => {
    const body = { candidates: [{ content: { parts: [{ text: '{"title": ' }, { text: '"A. B"}' }] }, finishReason: "STOP" }] };
    const out = await sendGeminiRequest({ request: build(), fetch: okResponse(body), timeoutMs: 1000 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.text).toBe('{"title": "A. B"}');
  });
});

describe("geminireq — every failure class is named (prompt §7)", () => {
  it("rate-limit honours Retry-After seconds and allows a retry", async () => {
    const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(429, { error: { message: "quota" } }, { "retry-after": "30" }), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.kind).toBe("rate-limit");
      expect(out.failure.retryAfterMs).toBe(30_000);
      expect(out.failure.retryable).toBe(true);
    }
  });

  it("rate-limit falls back to the body's retryDelay when the header is absent", async () => {
    const body = { error: { details: [{ retryDelay: "20s" }] } };
    const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(429, body), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.retryAfterMs).toBe(20_000);
  });

  it("invalid-key for 401/403 — never retryable", async () => {
    for (const status of [401, 403]) {
      const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(status, { error: { message: "API key not valid" } }), timeoutMs: 1000 });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.failure.kind).toBe("invalid-key");
      if (!out.ok) expect(out.failure.retryable).toBe(false);
    }
  });

  it("bad-request for a 400", async () => {
    const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(400, { error: { message: "invalid schema" } }), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("bad-request");
  });

  it("malformed for an unparseable 200 body", async () => {
    const fetch: GeminiFetch = async () => new Response("<not json>", { status: 200 });
    const out = await sendGeminiRequest({ request: build(), fetch, timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("malformed");
  });

  it("truncated for MAX_TOKENS — the answer is never parsed", async () => {
    const body = { candidates: [{ content: { parts: [{ text: '{"title": "half' }] }, finishReason: "MAX_TOKENS" }] };
    const out = await sendGeminiRequest({ request: build(), fetch: okResponse(body), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("truncated");
  });

  it("refusal for a blocked prompt and for SAFETY/RECITATION finishes", async () => {
    const blocked = { promptFeedback: { blockReason: "SAFETY" } };
    const out1 = await sendGeminiRequest({ request: build(), fetch: okResponse(blocked), timeoutMs: 1000 });
    expect(out1.ok).toBe(false);
    if (!out1.ok) expect(out1.failure.kind).toBe("refusal");
    for (const finishReason of ["SAFETY", "RECITATION", "PROHIBITED_CONTENT"]) {
      const body = { candidates: [{ content: { parts: [{ text: "x" }] }, finishReason }] };
      const out = await sendGeminiRequest({ request: build(), fetch: okResponse(body), timeoutMs: 1000 });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.failure.kind).toBe("refusal");
    }
  });

  it("no-answer when a 200 carries no candidate text", async () => {
    const out = await sendGeminiRequest({ request: build(), fetch: okResponse({ candidates: [] }), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("no-answer");
  });

  it("network — outcome unknown, NEVER auto-resubmitted", async () => {
    const fetch: GeminiFetch = async () => { throw new TypeError("connection reset"); };
    const out = await sendGeminiRequest({ request: build(), fetch, timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.kind).toBe("network");
      expect(out.failure.retryable).toBe(false);
      expect(out.failure.message).toContain("connection reset");
    }
  });

  it("timeout — outcome unknown, NEVER auto-resubmitted", async () => {
    const fetch: GeminiFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const out = await sendGeminiRequest({ request: build(), fetch, timeoutMs: 15 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.kind).toBe("timeout");
      expect(out.failure.retryable).toBe(false);
    }
  });

  it("a 5xx is an unknown outcome — never auto-resubmitted", async () => {
    const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(503, { error: { message: "unavailable" } }), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.kind).toBe("network");
      expect(out.failure.retryable).toBe(false);
      expect(out.failure.status).toBe(503);
    }
  });

  it("keeps the request id with a failure when the provider sent one", async () => {
    const out = await sendGeminiRequest({ request: build(), fetch: statusResponse(429, {}, { "x-goog-request-id": "req-9" }), timeoutMs: 1000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.requestId).toBe("req-9");
  });
});
