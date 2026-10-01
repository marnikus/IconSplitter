// runner.test.ts — one batch against an injected fetch: payload, retries only
// for rate limits, uncertain states never blind-retried, partial results kept,
// secrets scrubbed from failures (spec §10, §14).
import { describe, expect, it } from "vitest";
import { runBatch, type FetchLike } from "../src/svggen/runner";
import { makeBatches } from "../src/lib/svgmanifest";
import { DEFAULT_CONFIG } from "../src/lib/requesty";

const KEY = "rq_live_secretXYZ";
const src = (name: string) => ({ id: name, name, relPath: "", fingerprint: `fp-${name}` });
const batch = () => makeBatches([src("one"), src("two")], 2)[0];

const good = (t: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><title>${t}</title><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g></svg>`;

const okBody = (text: string) => JSON.stringify({
  id: "c1", choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.02 },
});

function fakeFetch(responses: { status: number; body: string }[]): { fn: FetchLike; count: () => number } {
  let n = 0;
  const fn: FetchLike = async () => {
    const r = responses[Math.min(n, responses.length - 1)];
    n++;
    return { status: r.status, text: async () => r.body };
  };
  return { fn, count: () => n };
}

describe("runBatch", () => {
  it("sends the documented payload and records actual usage", async () => {
    let seen: unknown = null;
    const fn: FetchLike = async (_url, init) => {
      seen = JSON.parse((init.body as string));
      return { status: 200, text: async () => okBody(good("one") + good("two")) };
    };
    const out = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "prompt", imageUrl: "data:image/png;base64,A=", fetchLike: fn });
    expect(out.failure).toBeNull();
    expect((seen as { model: string }).model).toBe("openai/gpt-6.1-sol");
    expect(JSON.stringify(seen)).not.toContain(KEY);
    expect(out.usage).toMatchObject({ tokensTotal: 150, cost: 0.02 });
    expect(out.outcomes.every((o) => o.kind === "saved")).toBe(true);
    expect(out.partial).toBe(false);
  });

  it("retries rate limits but not server errors", async () => {
    const rate = fakeFetch([{ status: 429, body: "{}" }, { status: 200, body: okBody(good("one") + good("two")) }]);
    const rateOut = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: rate.fn });
    expect(rateOut.failure).toBeNull();
    expect(rate.count()).toBe(2);

    const err = fakeFetch([{ status: 500, body: "{}" }]);
    const errOut = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: err.fn });
    expect(errOut.failure?.kind).toBe("unknown");
    expect(errOut.failure?.retryable).toBe(false);
    expect(err.count()).toBe(1); // never blind-retried
  });

  it("network drop and malformed bodies are uncertain, never blind-retried", async () => {
    const drop: FetchLike = async () => { throw new DOMException("timeout", "TimeoutError"); };
    const dropOut = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: drop });
    expect(dropOut.failure?.kind).toBe("timeout");
    expect(dropOut.failure?.retryable).toBe(false);

    const bad = fakeFetch([{ status: 200, body: JSON.stringify({ nope: true }) }]);
    const badOut = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: bad.fn });
    expect(badOut.failure?.kind).toBe("malformed");
  });

  it("keeps the valid half of a partial response", async () => {
    const fn: FetchLike = async () => ({ status: 200, text: async () => okBody(good("one") + good("nope")) });
    const out = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: fn });
    expect(out.partial).toBe(true);
    expect(out.outcomes.find((o) => o.sourceId === "one")?.kind).toBe("saved");
    expect(out.outcomes.find((o) => o.sourceId === "two")?.kind).toBe("missing");
    expect(out.summary).toMatchObject({ saved: 1, missing: 1 });
  });

  it("cancel before send makes no request and keeps everything unchanged", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let called = 0;
    const fn: FetchLike = async () => { called++; return { status: 200, text: async () => okBody("") }; };
    const out = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: fn, signal: ctrl.signal });
    expect(called).toBe(0);
    expect(out.cancelled).toBe(true);
    expect(out.outcomes).toEqual([]);
  });

  it("scrubs the key from provider error text", async () => {
    const fn: FetchLike = async () => ({ status: 401, text: async () => JSON.stringify({ error: { message: `invalid key ${KEY}` } }) });
    const out = await runBatch({ batch: batch(), cfg: DEFAULT_CONFIG, key: KEY, prompt: "p", imageUrl: "d", fetchLike: fn });
    expect(out.failure?.kind).toBe("auth");
    expect(out.failure?.safeMessage).not.toContain(KEY);
  });
});
