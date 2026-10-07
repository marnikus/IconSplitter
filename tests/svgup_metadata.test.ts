// svgup_metadata.test.ts — the ONE paid request per icon (design §8/§9, phase D
// contract: "transport reuse, refusal/error mapping, journal, no duplicate
// submission"). What this file proves, in the request's own words:
//   · the body is the SAME OpenAI-compatible shape the Generate SVG tab sends
//     (built by lib/svgrequest, not a second request format);
//   · an accepted answer becomes an accepted record — title, description, tags,
//     the request id, the tokens and the cost;
//   · a refused answer becomes a record a human can see, carrying the policy's
//     own errors and whatever the model DID return, so the field can be corrected;
//   · every transport outcome maps to the state the UI promises (cancel → pending,
//     stall/network → interrupted, provider error → rejected) and NOTHING is
//     retried — the fake fetch counts its calls, so a retry cannot hide.
import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/lib/svgrequest";
import { chatUrlOf, generateMetadata, metadataRequest, readStoredRecord, type MetadataArgs } from "../src/svgupload/metadata";
import { fortyTags, SOURCE_SHA } from "./helpers/svgupmeta";

const ANSWER = [
  "TITLE: Trophy award symbol for winners. Icon of trophy and award.",
  "DESCRIPTION: A simple trophy drawn with clean editable strokes for winner and success listings.",
  `TAGS: ${fortyTags().join(", ")}`,
].join("\n");

const KEY = "test-key-not-real";

/** The SSE frames a streamed answer arrives in: content deltas, then usage. */
function sseFrames(text: string, opts: { cost?: number | null; id?: string } = {}): string {
  const delta = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  const cost = "cost" in opts ? opts.cost : 0.0007; // an explicit null means "not reported"
  const use = JSON.stringify({
    choices: [],
    usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, cost },
  });
  return `${delta}data: ${use}\n\ndata: [DONE]\n\n`;
}

function sseResponse(text: string, opts: { cost?: number | null; id?: string } = {}): Response {
  return new Response(sseFrames(text, opts), {
    status: 200,
    headers: { "content-type": "text/event-stream", ...(opts.id === undefined ? {} : { "x-request-id": opts.id }) },
  });
}

/** A fetch that records every call, so "no retry" is a countable fact. */
function countingFetch(response: Response | (() => Promise<never>)): { fetch: FetchLike; calls: () => number } {
  let calls = 0;
  const fetch: FetchLike = async () => {
    calls += 1;
    if (typeof response === "function") return await response();
    return response;
  };
  return { fetch, calls: () => calls };
}

function argsOf(over: Partial<MetadataArgs> = {}): MetadataArgs {
  return {
    baseUrl: "https://router.requesty.ai/v1",
    model: "gemini-3.1-flash-lite",
    apiKey: KEY,
    prompt: "Name this icon.",
    image: "data:image/jpeg;base64,AAAA",
    params: { temperature: null, maxTokens: 8000, effort: "low" },
    pairId: "pair_1",
    sourceFingerprint: SOURCE_SHA,
    provider: "requesty",
    stallMs: 120_000,
    ...over,
  };
}

describe("the request body", () => {
  it("reuses the shared chat shape: text + image, streaming, usage requested", () => {
    const body = metadataRequest(argsOf()) as unknown as Record<string, unknown>;
    expect(body.model).toBe("gemini-3.1-flash-lite");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    const content = (body.messages as { content: unknown[] }[])[0].content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(content[0]).toEqual({ type: "text", text: "Name this icon." });
    expect(content[1].image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("posts to one chat endpoint, whatever the base URL's trailing slash", () => {
    expect(chatUrlOf("https://router.requesty.ai/v1")).toBe("https://router.requesty.ai/v1/chat/completions");
    expect(chatUrlOf("https://router.requesty.ai/v1/")).toBe("https://router.requesty.ai/v1/chat/completions");
  });
});

describe("an accepted answer", () => {
  it("becomes an accepted record with the request id, tokens and cost", async () => {
    const seen = countingFetch(sseResponse(ANSWER, { id: "req_42" }));
    const out = await generateMetadata(argsOf({ fetch: seen.fetch }), () => "2026-10-07T10:00:00.000Z");
    expect(out.error).toBeNull();
    expect(out.meta?.tags).toHaveLength(40);
    expect(out.record.status).toBe("accepted");
    expect(out.record.requestId).toBe("req_42");
    expect(out.record.usage).toEqual({ input: 900, output: 300, total: 1200 });
    expect(out.record.cost.actual).toBe(0.0007);
    expect(out.record.at).toBe("2026-10-07T10:00:00.000Z");
    expect(out.record.model).toBe("gemini-3.1-flash-lite");
    expect(out.record.sourceFingerprint).toBe(SOURCE_SHA); // the provenance the store compares
    expect(seen.calls()).toBe(1);
  });

  it("keeps an estimate only when the provider reported no cost", async () => {
    const seen = countingFetch(sseResponse(ANSWER, { cost: null }));
    const out = await generateMetadata(argsOf({ fetch: seen.fetch }));
    expect(out.record.cost.actual).toBeNull();
    expect(out.record.cost.estimated).not.toBeNull();
  });
});

describe("a refused answer", () => {
  it("is reported with the policy's errors and the partial text, and is not retried", async () => {
    const short = ANSWER.replace(fortyTags().slice(0, 1).join(","), "").replace(fortyTags()[0] + ", ", "");
    const seen = countingFetch(sseResponse(short));
    const out = await generateMetadata(argsOf({ fetch: seen.fetch }));
    expect(out.meta).toBeNull();
    expect(out.record.status).toBe("rejected");
    expect(out.error ?? "").not.toBe("");
    expect(out.record.errors.length).toBeGreaterThan(0);
    // The partial value is kept so the user can fix the field instead of paying again.
    expect(out.record.tags.length).toBeGreaterThan(0);
    expect(seen.calls()).toBe(1);
  });

  it("refuses a truncated answer even when the fields themselves look complete", async () => {
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: ANSWER }, finish_reason: "length" }] })}\n\n`
      + `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 } })}\n\ndata: [DONE]\n\n`;
    const seen = countingFetch(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const out = await generateMetadata(argsOf({ fetch: seen.fetch }));
    expect(out.record.status).toBe("rejected");
    expect((out.record.errors.join(" ") + (out.error ?? "")).toLowerCase()).toContain("truncat");
  });
});

describe("transport outcomes", () => {
  it("maps a user cancel to pending, a stall to interrupted and a provider error to rejected", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const cancel = countingFetch(async () => { throw new DOMException("cancelled", "AbortError"); });
    const cancelled = await generateMetadata(argsOf({ fetch: cancel.fetch, signal: aborted.signal }));
    expect(cancelled.record.status).toBe("pending");
    expect(cancelled.meta).toBeNull();

    const bad = countingFetch(new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 }));
    const refused = await generateMetadata(argsOf({ fetch: bad.fetch }));
    expect(refused.record.status).toBe("rejected");
    expect(refused.record.errors.join(" ")).toContain("404");
    expect(bad.calls()).toBe(1);
  });

  it("never records fake tokens for a request that produced nothing", async () => {
    const bad = countingFetch(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }));
    const out = await generateMetadata(argsOf({ fetch: bad.fetch }));
    expect(out.record.usage).toEqual({ input: null, output: null, total: null });
    expect(out.record.cost.actual).toBeNull();
  });
});

describe("reading a stored record back", () => {
  it("reads a stored record, refuses junk, and never believes an unchecked 'accepted'", () => {
    expect(readStoredRecord(null)).toBeNull();
    expect(readStoredRecord(42)).toBeNull();
    expect(readStoredRecord({ tags: ["a"] })).toBeNull(); // no identity at all
    // A record without a status is kept but is NOT an accepted answer.
    const bare = readStoredRecord({
      pairId: "p", title: "t", description: "d", tags: ["a"], at: "now", prompt: "pr", provider: "requesty",
      model: "gemini-3.1-flash-lite", requestId: null, usage: { input: null, output: null, total: null },
      cost: { actual: null, estimated: null, currency: "USD" }, errors: [], warnings: [], sourceFingerprint: "1:2",
    });
    expect(bare).not.toBeNull();
    expect(bare?.status).toBe("pending");
  });
});
