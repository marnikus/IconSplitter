// svg_imgrunner.test.ts — the AI source regeneration batch sends the prompt AND
// the source's current main image to /images/edits (user request 2026-10-19).
// An unreadable reference is an honest per-item failure, never a silent
// text-only request (RULE 4/5). The network is an injected fetch.
import { describe, expect, it } from "vitest";
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

describe("the response path is unchanged", () => {
  it("HTTP errors stay honest", async () => {
    const out = await runImageBatch(args({}, fakeFetch([], () => new Response("no", { status: 402 }))));
    expect(out[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/HTTP 402/) });
  });
});
