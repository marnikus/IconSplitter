// svg_imgrunner.test.ts — the AI source regeneration batch sends the prompt AND
// the source's current main image to /images/edits (user request 2026-10-19).
// An unreadable reference is an honest per-item failure, never a silent
// text-only request (RULE 4/5). The network is an injected fetch.
// 2026-10-19 fix (archive/2026-10-19-image-regen-fix): every outcome is
// reported the moment it lands (RC3), failures carry the provider's own reason
// (RC4), Stop sends nothing new (RULE 7), and the wait is the image's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_CONNECTION } from "../src/lib/svgconnections";
import { runImageBatch, type ImageRegenArgs } from "../src/svg/imgrunner";

interface Call { url: string; init: RequestInit }

function fakeFetch(calls: Call[], reply?: () => Response): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply ? reply() : new Response(JSON.stringify({ data: [{ b64_json: "UE5H" }] }), { status: 200 });
  }) as unknown as typeof fetch;
}

const ref = (text: string) => async () => new Blob([text], { type: "image/png" });

function args(over: Partial<ImageRegenArgs>, fetchImpl: typeof fetch): ImageRegenArgs {
  return {
    conn: DEFAULT_IMAGE_CONNECTION, key: "rq_key", prompt: "Redraw thin stroke",
    items: [{ id: "a", fileName: "a_AI.png", reference: ref("AAA") }],
    concurrency: 2, timeoutMs: 5000, fetchImpl, ...over,
  };
}

describe("regeneration request = prompt + reference image", () => {
  it("posts multipart to /images/edits with the reference bytes and the prompt", async () => {
    const calls: Call[] = [];
    const out = await runImageBatch(args({}, fakeFetch(calls)));
    expect(out[0].status).toBe("done");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/images\/edits$/);
    const form = calls[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("prompt")).toBe("Redraw thin stroke");
    const file = form.get("image[]") as File;
    expect(await file.text()).toBe("AAA");
    expect(file.name).toBe("a_AI.png");
  });

  it("lets the browser set the multipart boundary: Bearer key, NO Content-Type header", async () => {
    const calls: Call[] = [];
    await runImageBatch(args({}, fakeFetch(calls)));
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer rq_key");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("content-type");
  });

  it("each source sends ITS OWN image", async () => {
    const calls: Call[] = [];
    await runImageBatch(args({
      items: [{ id: "a", fileName: "a_AI.png", reference: ref("AAA") }, { id: "b", fileName: "b_AI.png", reference: ref("BBB") }],
      concurrency: 1,
    }, fakeFetch(calls)));
    const sent = await Promise.all(calls.map((c) => ((c.init.body as FormData).get("image[]") as File).text()));
    expect(sent).toEqual(["AAA", "BBB"]);
  });
});

describe("an unreadable reference is an honest failure, never a text-only request", () => {
  it("fails that item with a clear reason and sends nothing for it; the others still run", async () => {
    const calls: Call[] = [];
    const out = await runImageBatch(args({
      items: [{ id: "a", fileName: "a_AI.png", reference: async () => null }, { id: "b", fileName: "b_AI.png", reference: ref("BBB") }],
      concurrency: 1,
    }, fakeFetch(calls)));
    expect(out[0].status).toBe("failed");
    expect(out[0].error).toMatch(/current AI image could not be read/i);
    expect(out[1].status).toBe("done");
    expect(calls).toHaveLength(1);
  });

  it("a reader that throws is the same per-item failure", async () => {
    const calls: Call[] = [];
    const out = await runImageBatch(args({ items: [{ id: "a", fileName: "a.png", reference: async () => { throw new Error("disk gone"); } }] }, fakeFetch(calls)));
    expect(out[0].status).toBe("failed");
    expect(out[0].error).toMatch(/disk gone/);
    expect(calls).toHaveLength(0);
  });
});

describe("what each request spent travels with its result (2026-10-19)", () => {
  it("a done item carries the provider usage and request id", async () => {
    const body = { data: [{ b64_json: "UE5H" }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost: 0.05 } };
    const reply = () => new Response(JSON.stringify(body), { status: 200, headers: { "x-request-id": "req-1" } });
    const out = await runImageBatch(args({}, fakeFetch([], reply)));
    expect(out[0]).toMatchObject({ status: "done", requestId: "req-1", usage: { input: 10, output: 20, total: 30, cost: 0.05 } });
  });

  it("a response without usage says so with nulls, never zeros", async () => {
    const out = await runImageBatch(args({}, fakeFetch([])));
    expect(out[0].usage).toMatchObject({ total: null, cost: null });
  });
});

describe("the response path is unchanged", () => {
  it("HTTP errors stay honest", async () => {
    const out = await runImageBatch(args({}, fakeFetch([], () => new Response("no", { status: 402 }))));
    expect(out[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/HTTP 402/) });
  });
});

afterEach(() => { vi.useRealTimers(); });

const three = [
  { id: "a", fileName: "a_AI.png", reference: ref("AAA") },
  { id: "b", fileName: "b_AI.png", reference: ref("BBB") },
  { id: "c", fileName: "c_AI.png", reference: ref("CCC") },
];

describe("every outcome is reported the moment it lands (RC3)", () => {
  it("calls onResult once per item, in landing order, with its index and the decoded image", async () => {
    const seen: [number, string, string][] = [];
    const out = await runImageBatch(args({ items: three, concurrency: 1, onResult: (r, i) => { seen.push([i, r.id, r.status]); } }, fakeFetch([])));
    expect(seen).toEqual([[0, "a", "done"], [1, "b", "done"], [2, "c", "done"]]);
    expect(await out[0].blob?.text()).toBe("PNG");
    expect(out.map((r) => r.status)).toEqual(["done", "done", "done"]);
  });
});

describe("failures carry the provider's own reason (RC4)", () => {
  it("an HTTP error names the status AND the router's message", async () => {
    const body = { error: { origin: "router", message: "Invalid value for 'size'" } };
    const [r] = await runImageBatch(args({}, fakeFetch([], () => new Response(JSON.stringify(body), { status: 400 }))));
    expect(r).toMatchObject({ status: "failed", error: "the image request failed (HTTP 400 Invalid value for 'size')" });
  });

  it("an HTTP error without a JSON body still names the status", async () => {
    const [r] = await runImageBatch(args({}, fakeFetch([], () => new Response("<html>bad gateway</html>", { status: 502 }))));
    expect(r.error).toBe("the image request failed (HTTP 502)");
  });

  it("an unreachable provider says so, with the browser's reason", async () => {
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const [r] = await runImageBatch(args({}, offline));
    expect(r.error).toBe("the image request could not reach the provider (Failed to fetch)");
  });

  it("no answer within the wait limit: a plain timeout, nothing saved", async () => {
    vi.useFakeTimers();
    const never = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")));
    })) as unknown as typeof fetch;
    const run = runImageBatch(args({ timeoutMs: 2_000 }, never));
    await vi.advanceTimersByTimeAsync(2_001);
    const [r] = await run;
    expect(r.error).toBe("no answer within 2 s — nothing was saved");
  });

  it("a response without an image is a named failure, never a blank success", async () => {
    const [r] = await runImageBatch(args({}, fakeFetch([], () => new Response(JSON.stringify({ data: [] }), { status: 200 }))));
    expect(r).toMatchObject({ status: "failed", error: "the image response had no image in it" });
  });
});

describe("Stop (RULE 7)", () => {
  it("starts no new request once stopped; what was never sent has no outcome", async () => {
    const calls: Call[] = [];
    let stop = false;
    const out = await runImageBatch(args({ items: three, concurrency: 1, shouldStop: () => stop, onResult: () => { stop = true; } }, fakeFetch(calls)));
    expect(calls).toHaveLength(1);
    expect(out.filter((r) => r !== undefined)).toHaveLength(1);
  });
});
