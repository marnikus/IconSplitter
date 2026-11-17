// svg_web_transport.test.ts — the web transport object (2026-11-03): it owns
// its chat URL (a restarted chat moves only this transport, never the run's
// arguments) and every web turn of every parallel run goes through the
// helper ONE at a time, because the helper drives a single browser page. A
// turn cancelled while it waits is never sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebTransport } from "../src/svg/runweb";

const TARGET = { url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000, readyTimeoutMs: 180_000, stepDelayMs: 0 };
const request = (signal = new AbortController().signal) => ({ prompt: "p", image: "data:image/png;base64,AA", key: "k", signal });
const reply = (chatUrl: string | null = null) => new Response(JSON.stringify({ ok: true, text: "<svg/>", chatUrl, restarted: chatUrl !== null }), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); });

describe("createWebTransport", () => {
  it("sends to the chat it owns and follows a restarted chat without touching its target argument", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      urls.push(JSON.parse(String(init?.body)).url as string);
      return reply(urls.length === 1 ? "https://chatgpt.com/c/new-1" : null);
    }));
    const target = { ...TARGET };
    const onChatUrl = vi.fn();
    const web = createWebTransport(target, { onChatUrl });
    await web.send(request());
    await web.send(request());
    expect(urls).toEqual(["https://chatgpt.com/c/abc", "https://chatgpt.com/c/new-1"]);
    expect(onChatUrl).toHaveBeenCalledOnce();
    expect(target.url).toBe("https://chatgpt.com/c/abc");
  });

  it("ignores a reply URL that is not a conversation page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("https://chatgpt.com/")));
    const onChatUrl = vi.fn();
    await createWebTransport(TARGET, { onChatUrl }).send(request());
    expect(onChatUrl).not.toHaveBeenCalled();
  });

  it("runs the turns of two runs one after the other, never together", async () => {
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => releases.push(r));
      inFlight -= 1;
      return reply();
    }));
    const a = createWebTransport(TARGET).send(request());
    const b = createWebTransport(TARGET).send(request());
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]();
    expect((await a).ok && (await b).ok).toBe(true);
    expect(peak).toBe(1);
  });

  it("never sends a turn that was cancelled while it waited", async () => {
    let release: () => void = () => undefined;
    const fetchFn = vi.fn(async () => { await new Promise<void>((r) => { release = r; }); return reply(); });
    vi.stubGlobal("fetch", fetchFn);
    const first = createWebTransport(TARGET).send(request());
    const controller = new AbortController();
    const waiting = createWebTransport(TARGET).send(request(controller.signal));
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await waiting).toMatchObject({ ok: false, failure: "aborted" });
    release();
    await first;
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passes ChatGPT's own limit message to the run, never as a retryable success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false, code: "limit", reason: "You’re out of attachments for now. Try again after 11:47 PM.",
    }), { status: 429 })));
    const out = await createWebTransport(TARGET).send(request());
    expect(out).toMatchObject({ ok: false, failure: "rate_limit", error: "ChatGPT web: You’re out of attachments for now. Try again after 11:47 PM." });
  });

  it("sends the prompt's icon line as the anchor and shows an activity bar until the reply is in", async () => {
    const { activities } = await import("../src/lib/activity");
    activities.clear();
    let release: () => void = () => undefined;
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/aichat/progress")) {
        return new Response(JSON.stringify({ ok: true, progress: { phase: "generating", at: 1 } }), { status: 200 });
      }
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      await new Promise<void>((r) => { release = r; });
      return reply();
    }));
    const run = createWebTransport(TARGET, { pollMs: 5 }).send({ ...request(), prompt: "Icon name (use it as the SVG <title>): fog_AI\n\nfix", label: "fog_AI" });
    await vi.waitFor(() => expect(activities.list()[0]?.label).toBe("ChatGPT web · fog_AI — ChatGPT is generating…"));
    release();
    expect((await run).ok).toBe(true);
    // a one-off request id, written right under the icon line, is what the helper looks for
    expect(String(sent[0].anchor)).toMatch(/^Request id: r-[a-z0-9]+-[a-z0-9]+$/);
    expect(String(sent[0].prompt)).toBe(`Icon name (use it as the SVG <title>): fog_AI\n\n${String(sent[0].anchor)}\n\nfix`);
    expect(activities.list()).toEqual([]); // closes itself once the reply is in
  });

  it("gives every request its own id, so the same icon sent twice is still told apart", async () => {
    const anchors: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      anchors.push(String((JSON.parse(String(init?.body)) as { anchor: string }).anchor));
      return reply();
    }));
    const web = createWebTransport(TARGET);
    await web.send({ ...request(), prompt: "Icon name (use it as the SVG <title>): fog_AI\n\nfix" });
    await web.send({ ...request(), prompt: "Icon name (use it as the SVG <title>): fog_AI\n\nfix" });
    expect(anchors[0]).not.toBe(anchors[1]);
  });
});
