// gemini_client.test.ts — the provider transport, exercised through the REAL
// client with an injected fetch (RULE 8): the retry rule, the timeout, the
// refusal and truncation paths, and the rule that an uncertain submission is
// never paid for twice.
import { describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_CONFIG, estimateCost, generateContentUrl, parseGeminiConfig, RATE_CARD } from "../src/lib/geminiconfig";
import { buildRequestBody, metadataSchema } from "../src/lib/geminirequest";
import { parseGeminiResponse, parseJsonText, stripJsonFence } from "../src/lib/geminiparse";
import { sendMetadata, type Transport } from "../src/lib/geminiclient";

const IMAGE = { mimeType: "image/jpeg", base64: "AAAA" };
const config = (over = {}) => ({ ...DEFAULT_GEMINI_CONFIG, retries: 1, ...over });

const answer = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const okBody = (text: string, finishReason = "STOP") => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 2_000, totalTokenCount: 3_000 },
  modelVersion: "gemini-3.1-flash-lite",
  responseId: "req_1",
});

/** A transport that answers with the given script, recording every call. */
function scripted(responses: (() => Response | Promise<Response>)[]): { transport: Transport; calls: number } {
  const state = { calls: 0 };
  return {
    get calls() { return state.calls; },
    transport: async () => {
      const next = responses[Math.min(state.calls, responses.length - 1)];
      state.calls += 1;
      return next();
    },
  };
}

describe("geminiconfig", () => {
  it("builds the verified endpoint and never substitutes the model", () => {
    expect(generateContentUrl(DEFAULT_GEMINI_CONFIG.baseUrl, "gemini-3.1-flash-lite"))
      .toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    expect(parseGeminiConfig({ model: "  " }).model).toBe("gemini-3.1-flash-lite");
    expect(parseGeminiConfig({ model: "gemini-3.1-flash-lite-001" }).model).toBe("gemini-3.1-flash-lite-001");
  });

  it("ignores a non-https base URL and clamps every number", () => {
    const c = parseGeminiConfig({ baseUrl: "http://evil.test", timeoutMs: 1, retries: 99, concurrency: 0, temperature: 5, maxOutputTokens: 1e9 });
    expect(c.baseUrl).toBe(DEFAULT_GEMINI_CONFIG.baseUrl);
    expect(c).toMatchObject({ timeoutMs: 5_000, retries: 3, concurrency: 1, temperature: 2, maxOutputTokens: 32_000 });
  });

  it("labels money as an estimate and cites the rate card", () => {
    const cost = estimateCost({ input: 1_000_000, output: 1_000_000, total: 2_000_000 });
    expect(cost.actual).toBeNull();
    expect(cost.basis).toBe("rate-card");
    expect(cost.estimated).toBeCloseTo(RATE_CARD.inputPerMillion + RATE_CARD.outputPerMillion, 6);
    expect(cost.pricing).toContain(RATE_CARD.version);
    expect(estimateCost({ input: null, output: null, total: null }).basis).toBe("none");
  });
});

describe("geminirequest", () => {
  it("puts the image first, the prompt second, and no key anywhere", () => {
    const body = buildRequestBody({ prompt: "do it", image: IMAGE, config: config() });
    const parts = body.contents[0].parts;
    expect(parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
    expect(parts[1]).toEqual({ text: "do it" });
    expect(JSON.stringify(body)).not.toContain("x-goog-api-key");
  });

  it("asks for a JSON answer only when structured output is on", () => {
    expect(buildRequestBody({ prompt: "x", image: IMAGE, config: config() }).generationConfig.responseMimeType).toBe("application/json");
    expect(buildRequestBody({ prompt: "x", image: IMAGE, config: config({ structured: false }) }).generationConfig.responseMimeType).toBeUndefined();
    expect(metadataSchema()).toMatchObject({ required: ["title", "description", "tags"] });
  });
});

describe("geminiparse", () => {
  it("reads the text, the finish reason, the usage and the request id", () => {
    const parsed = parseGeminiResponse(200, okBody("hello"));
    expect(parsed).toMatchObject({ ok: true, text: "hello", finishReason: "STOP", requestId: "req_1" });
    if (parsed.ok) expect(parsed.usage.total).toBe(3_000);
  });

  it("names a refusal, a truncation and a schema failure separately", () => {
    expect(parseGeminiResponse(200, okBody("", "SAFETY"))).toMatchObject({ ok: false, kind: "refusal", resendable: false });
    expect(parseGeminiResponse(200, okBody("half a", "MAX_TOKENS"))).toMatchObject({ ok: false, kind: "truncated", resendable: true });
    expect(parseGeminiResponse(200, { candidates: [] })).toMatchObject({ ok: false, kind: "malformed" });
    expect(parseGeminiResponse(200, okBody("   "))).toMatchObject({ ok: false, kind: "malformed" });
  });

  it("maps the HTTP statuses to the message the user reads", () => {
    expect(parseGeminiResponse(401, { error: { message: "API key not valid" } })).toMatchObject({ ok: false, kind: "auth" });
    expect(parseGeminiResponse(429, {})).toMatchObject({ ok: false, kind: "rate-limit", resendable: true });
    expect(parseGeminiResponse(503, {})).toMatchObject({ ok: false, kind: "server", resendable: false });
    expect(parseGeminiResponse(400, { error: { message: "bad model" } })).toMatchObject({ ok: false, kind: "bad-request" });
    const failure = parseGeminiResponse(400, { error: { message: "bad model" } });
    if (!failure.ok) expect(failure.message).toContain("bad model");
  });

  it("strips a JSON fence instead of parsing around it", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(parseJsonText('```\n{"a":1}\n```')).toMatchObject({ ok: true });
    expect(parseJsonText("not json")).toMatchObject({ ok: false, kind: "malformed" });
  });
});

describe("geminiclient", () => {
  it("sends once and reports usage, cost and the attempt count", async () => {
    const fake = scripted([() => answer(okBody('{"title":"x"}'))]);
    const sent = await sendMetadata({ prompt: "p", image: IMAGE, config: config(), key: "k", transport: fake.transport });
    expect(sent.outcome.ok).toBe(true);
    expect(sent.attempts).toBe(1);
    expect(sent.cost.basis).toBe("rate-card");
    expect(sent.error).toBe("");
    expect(sent.unknown).toBe(false);
  });

  it("retries a 429 (the one answer that proves nothing was processed)", async () => {
    const fake = scripted([() => answer({ error: { message: "quota" } }, 429), () => answer(okBody("ok"))]);
    const sent = await sendMetadata({
      prompt: "p", image: IMAGE, config: config(), key: "k", transport: fake.transport, wait: async () => {},
    });
    expect(sent.outcome.ok).toBe(true);
    expect(sent.attempts).toBe(2);
  });

  it("does NOT resend after a timeout or a 5xx: completion is unknown", async () => {
    const timeout = scripted([() => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }]);
    const sent = await sendMetadata({ prompt: "p", image: IMAGE, config: config(), key: "k", transport: timeout.transport, wait: async () => {} });
    expect(sent.attempts).toBe(1);
    expect(sent.unknown).toBe(true);
    expect(sent.error).toMatch(/completion is unknown/);

    const server = scripted([() => answer({ error: { message: "boom" } }, 500)]);
    const second = await sendMetadata({ prompt: "p", image: IMAGE, config: config(), key: "k", transport: server.transport, wait: async () => {} });
    expect(second.attempts).toBe(1);
    expect(second.unknown).toBe(true);
  });

  it("never puts the key into the error text", async () => {
    // Built from pieces so the repository holds no key-shaped literal (secret hygiene).
    const FAKE_KEY = ["rq", "live", "abcdefghijklmnop"].join("_");
    const fake = scripted([() => answer({ error: { message: `bad key ${FAKE_KEY}` } }, 401)]);
    const sent = await sendMetadata({ prompt: "p", image: IMAGE, config: config(), key: FAKE_KEY, transport: fake.transport });
    expect(sent.error).not.toContain(FAKE_KEY);
    expect(sent.error).toContain("refused");
  });
});
