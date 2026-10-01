// requesty.test.ts — payload shape, response parsing and error classification
// for the Requesty gateway. No network: pure functions over shapes (RULE 8).
import { describe, expect, it } from "vitest";
import {
  buildChatBody, classifyStatus, DEFAULT_CONFIG, parseChatResponse, type RequestyConfig,
} from "../src/lib/requesty";

const cfg: RequestyConfig = { ...DEFAULT_CONFIG };

describe("buildChatBody", () => {
  it("uses the documented multimodal format with one image part per source", () => {
    const body = buildChatBody(cfg, "the prompt", ["data:image/png;base64,AAA=", "data:image/png;base64,BBB="]) as {
      model: string; messages: { role: string; content: unknown }[];
    };
    expect(body.model).toBe("openai/gpt-6.1-sol");
    const user = body.messages.find((m) => m.role === "user")!;
    const parts = user.content as { type: string; image_url?: { url: string } }[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts[0].type).toBe("text");
  });

  it("never embeds the api key in the body", () => {
    expect(JSON.stringify(buildChatBody(cfg, "p", []))).not.toContain("rq_");
  });
});

describe("parseChatResponse", () => {
  it("reads text and provider usage including cost", () => {
    const out = parseChatResponse({
      choices: [{ message: { content: "<svg></svg>" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.002 },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toBe("<svg></svg>");
      expect(out.usage).toEqual({ tokensIn: 10, tokensOut: 5, tokensTotal: 15, cost: 0.002 });
    }
  });

  it("tolerates missing usage but reports it as missing, never invented", () => {
    const out = parseChatResponse({ choices: [{ message: { content: "x" } }] });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.usage).toEqual({ tokensIn: null, tokensOut: null, tokensTotal: null, cost: null });
  });

  it("rejects malformed shapes", () => {
    expect(parseChatResponse({}).ok).toBe(false);
    expect(parseChatResponse(null).ok).toBe(false);
    expect(parseChatResponse({ choices: [] }).ok).toBe(false);
  });
});

describe("classifyStatus", () => {
  const key = "rq_live_topsecret9Z";
  it.each([
    [401, "auth"], [403, "auth"], [429, "rate"], [404, "model"], [413, "payload"],
    [408, "timeout"], [504, "timeout"], [500, "unknown"], [502, "unknown"],
  ])("%i -> %s", (status, kind) => {
    expect(classifyStatus(status, "{}", key).kind).toBe(kind);
  });

  it("marks only rate limits retryable at the request level; unknown never blind-retries", () => {
    expect(classifyStatus(429, "{}", key).retryable).toBe(true);
    expect(classifyStatus(500, "{}", key).retryable).toBe(false);
    expect(classifyStatus(408, "{}", key).retryable).toBe(false);
  });

  it("scrubs the key and provider secrets from safe messages", () => {
    const f = classifyStatus(401, JSON.stringify({ error: { message: `bad key ${key}` } }), key);
    expect(f.safeMessage).not.toContain(key);
    expect(f.safeMessage).not.toContain("topsecret");
  });

  it("400 with model-not-found is model, other 400 is payload", () => {
    expect(classifyStatus(400, JSON.stringify({ error: { code: "model_not_found" } }), key).kind).toBe("model");
    expect(classifyStatus(400, JSON.stringify({ error: { code: "invalid_request" } }), key).kind).toBe("payload");
  });
});
