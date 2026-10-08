// svg_stream_read.test.ts — the reader that decides whether a long generation
// is still alive (RULE 8). The stream is driven by hand and the clock is fake,
// so the prompt's verify list is decidable: a request that keeps talking may
// run for hours; one that goes silent for longer than the stall window is a
// dead connection with an UNKNOWN outcome (never resent); a user cancel is not
// a stall; a provider error is a confirmed failure; and a provider that ignores
// `stream: true` still yields its answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { capsFor } from "../src/lib/modelcaps";
import { buildChatRequest, type FetchLike } from "../src/lib/svgrequest";
import { sendChatStreaming } from "../src/lib/svgstreamread";

const KEY = ["rq", "live", "stream_test_key_4242"].join("_");
const enc = new TextEncoder();

function request() {
  return buildChatRequest({
    model: DEFAULT_CONFIG.model, prompt: "p", image: "data:image/png;base64,AA",
    caps: capsFor(DEFAULT_CONFIG.model), params: { temperature: null, maxTokens: 32_000, effort: "medium" },
  });
}

/** A response the test can drive: nothing arrives until push() is called. */
function manualStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  return {
    body,
    push: (...texts: string[]) => texts.forEach((text) => ctrl.enqueue(enc.encode(text))),
    close: () => ctrl.close(),
  };
}

function sse(headers: Record<string, string> = {}): Response {
  return {
    ok: true, status: 200, body: null as unknown as ReadableStream<Uint8Array>,
    headers: new Headers({ "content-type": "text/event-stream", ...headers }),
  } as unknown as Response;
}

function sseResponse(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Response {
  return { ...sse(headers), body } as Response;
}

function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: true, status: 200, body: null,
    headers: new Headers({ "content-type": "application/json", ...headers }),
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function fetchOf(response: Response | (() => Promise<never>)): FetchLike {
  return typeof response === "function" ? response : async () => response;
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2000, total_tokens: 2010, cost: 0.031 } })}\n\n`;

/** Runs pending microtasks without advancing the fake clock. */
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

/** Starts a send and lets the fetch/response plumbing settle (NOT the read). */
async function start(
  body: ReadableStream<Uint8Array>,
  opts: { stallMs: number; signal?: AbortSignal; onProgress?: (frames: number) => void; onId?: (id: string) => void },
): Promise<{ pending: ReturnType<typeof sendChatStreaming> }> {
  const pending = sendChatStreaming({
    url: "https://router.requesty.ai/v1/chat/completions", body: request(), apiKey: KEY,
    fetch: fetchOf(sseResponse(body)), stallMs: opts.stallMs, signal: opts.signal,
    onProgress: opts.onProgress, onId: opts.onId,
  });
  await flush();
  // Wrapped so awaiting `start` cannot accidentally await the stream itself.
  return { pending };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sendChatStreaming — long work survives, silence does not", () => {
  it("keeps a request alive for hours of keepalives and finishes it", async () => {
    const stream = manualStream();
    const seen: number[] = [];
    const { pending } = await start(stream.body, { stallMs: 120_000, onProgress: (frames) => seen.push(frames) });
    stream.push(delta("<svg"));
    // 20 minutes of a slow answer, a keepalive every 100 s: far beyond any
    // single stall window, and far beyond the old 90 s total timeout
    for (let minute = 0; minute < 20; minute += 1) {
      await vi.advanceTimersByTimeAsync(100_000);
      stream.push(": keepalive\n\n");
      await vi.advanceTimersByTimeAsync(60_000);
      stream.push(delta("."));
    }
    stream.push(delta("/>") + usage + "data: [DONE]\n\n");
    stream.close();
    const out = await pending;
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toBe("<svg" + ".".repeat(20) + "/>");
    expect(out.usage.cost).toBe(0.031);
    expect(out.frames).toBeGreaterThan(20);
    expect(seen.length).toBeGreaterThan(20);
  });

  it("calls silence longer than the window a dead connection, not slow work", async () => {
    const stream = manualStream();
    const { pending } = await start(stream.body, { stallMs: 120_000 });
    stream.push(delta("<svg"));
    await vi.advanceTimersByTimeAsync(121_000);
    const out = await pending;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("stalled");
    expect(out.failure.retryable).toBe(false);
    expect(out.failure.message.toLowerCase()).toContain("no data");
  });

  it("never calls a user cancel a stall", async () => {
    const stream = manualStream();
    const controller = new AbortController();
    const { pending } = await start(stream.body, { stallMs: 120_000, signal: controller.signal });
    stream.push(delta("<svg"));
    controller.abort();
    const out = await pending;
    expect(out.ok === false && out.failure.kind).toBe("aborted");
  });

  it("tells a cancel before the first byte from a connection that died", async () => {
    // The user cancels while the provider is still thinking: nothing was sent to
    // us yet, so this must say cancelled — never "the connection looks dead".
    const gate = new AbortController();
    const neverAnswers: FetchLike = (_url, init) => new Promise<Response>((_resolve, reject) => {
      const die = () => reject(new DOMException("aborted", "AbortError"));
      init.signal?.addEventListener("abort", die);
      gate.signal.addEventListener("abort", die);
    });
    const pending = sendChatStreaming({
      url: "u", body: request(), apiKey: KEY, stallMs: 120_000, fetch: neverAnswers, signal: gate.signal,
    });
    await flush();
    gate.abort();
    const out = await pending;
    expect(out.ok === false && out.failure.kind).toBe("aborted");
    expect(out.ok === false && out.failure.retryable).toBe(false);
  });

  it("calls a connection that dies before any byte a network error it may repeat", async () => {
    // The provider cannot have started generating: classifyTransport's own rule
    // says this is repeatable — a stall claim would be wrong AND would block a retry.
    const dead: FetchLike = async () => { throw new TypeError("Failed to fetch"); };
    const out = await sendChatStreaming({ url: "u", body: request(), apiKey: KEY, stallMs: 120_000, fetch: dead });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("network");
    expect(out.failure.retryable).toBe(true);
    expect(out.failure.message).toContain("Failed to fetch");
  });

  it("keeps the provider's request id, from the header or from the stream", async () => {
    const withHeader = manualStream();
    const first = sendChatStreaming({
      url: "u", body: request(), apiKey: KEY, stallMs: 120_000,
      fetch: fetchOf(sseResponse(withHeader.body, { "x-request-id": "req_header_1" })),
    });
    await flush();
    withHeader.push(delta("<svg/>") + "data: [DONE]\n\n");
    withHeader.close();
    const a = await first;
    expect(a.ok && a.requestId).toBe("req_header_1");

    const inStream = manualStream();
    const second = sendChatStreaming({ url: "u", body: request(), apiKey: KEY, stallMs: 120_000, fetch: fetchOf(sseResponse(inStream.body)) });
    await flush();
    inStream.push("id: chatcmpl-stream-9\n\n" + delta("<svg/>") + "data: [DONE]\n\n");
    inStream.close();
    const b = await second;
    expect(b.ok && b.requestId).toBe("chatcmpl-stream-9");
  });

  it("reports a provider error frame as a confirmed failure, not a stall", async () => {
    const stream = manualStream();
    const { pending } = await start(stream.body, { stallMs: 120_000 });
    stream.push(delta("<svg"), `data: ${JSON.stringify({ error: { message: "upstream timed out" } })}\n\n`);
    const out = await pending;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("provider");
    expect(out.failure.message).toContain("upstream timed out");
    expect(out.failure.retryable).toBe(false);
  });

  it("treats an early EOF as unknown, so a truncated answer is never saved as complete", async () => {
    const stream = manualStream();
    const { pending } = await start(stream.body, { stallMs: 120_000 });
    stream.push(delta("<svg/><svg/>"));
    stream.close();
    const out = await pending;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("stalled");
    expect(out.failure.message).toContain("[DONE]");
  });

  it("falls back to a JSON body when the provider ignores stream: true", async () => {
    const out = await sendChatStreaming({
      url: "u", body: request(), apiKey: KEY, stallMs: 120_000,
      fetch: fetchOf(jsonResponse({ choices: [{ message: { content: "<svg/>" } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cost: 0.5 } })),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toBe("<svg/>");
    expect(out.usage.cost).toBe(0.5);
  });

  it("says so when the stream carried nothing readable", async () => {
    const stream = manualStream();
    const { pending } = await start(stream.body, { stallMs: 120_000 });
    stream.push("data: {not json\n\n", "data: {still not json}\n\n", "data: [DONE]\n\n");
    stream.close();
    const out = await pending;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("malformed");
    expect(out.failure.message).toContain("2");
  });

  it("stalls even before the first byte when the provider never answers", async () => {
    const hanging: FetchLike = (_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const pending = sendChatStreaming({ url: "u", body: request(), apiKey: KEY, stallMs: 120_000, fetch: hanging });
    await flush();
    await vi.advanceTimersByTimeAsync(121_000);
    const out = await pending;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe("stalled");
  });

  it("hands the request id to the caller the moment the header or the stream provides it", async () => {
    const stream = manualStream();
    const ids: string[] = [];
    const pending = sendChatStreaming({
      url: "u", body: request(), apiKey: KEY, stallMs: 120_000,
      fetch: fetchOf(sseResponse(stream.body, { "x-request-id": "req_live_7" })), onId: (id) => ids.push(id),
    });
    await flush();
    expect(ids).toEqual(["req_live_7"]);
    stream.push(delta("<svg/>") + "data: [DONE]\n\n");
    stream.close();
    await pending;
    expect(ids).toEqual(["req_live_7"]);
  });

  it("classifies an HTTP failure before reading a stream", async () => {
    const failing = {
      ok: false, status: 503, body: null,
      headers: new Headers({ "retry-after": "3" }),
      text: async () => JSON.stringify({ error: { message: "upstream unavailable" } }),
    } as unknown as Response;
    const out = await sendChatStreaming({ url: "u", body: request(), apiKey: KEY, stallMs: 120_000, fetch: fetchOf(failing) });
    expect(out.ok === false && out.failure).toMatchObject({ kind: "provider", retryable: true, retryAfterMs: 3000 });
  });
});
