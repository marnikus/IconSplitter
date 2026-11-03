// Web generation through the ChatGPT page (2026-11-03): the stored settings
// are validated on read, and the loopback client posts one turn, follows its
// progress, maps every failure to an honest reason and cancels on abort. The
// helper is a fake fetch — no network, no chatgpt.com.

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEBCHAT_PREFS, isChatUrl, isConversationUrl, parseWebChatPrefs, webChatTargetOf,
} from "../src/lib/webchatprefs";
import { sendWebChat, type WebChatInput } from "../src/lib/webchatclient";

describe("webchatprefs", () => {
  it("defaults to off with a 10-minute max wait", () => {
    expect(parseWebChatPrefs(null)).toEqual(DEFAULT_WEBCHAT_PREFS);
    expect(DEFAULT_WEBCHAT_PREFS).toMatchObject({ enabled: false, url: "", maxWaitMin: 10 });
  });

  it("keeps valid values and repairs bad ones", () => {
    const p = parseWebChatPrefs({ enabled: true, url: " https://chatgpt.com/c/ab-1 ", maxWaitMin: 25, readyTimeoutMin: 0 });
    expect(p).toEqual({ enabled: true, url: "https://chatgpt.com/c/ab-1", maxWaitMin: 25, readyTimeoutMin: 1 });
    expect(parseWebChatPrefs({ maxWaitMin: "x", enabled: "yes" })).toMatchObject({ maxWaitMin: 10, enabled: false });
    expect(parseWebChatPrefs({ maxWaitMin: 999 }).maxWaitMin).toBe(60);
  });

  it("accepts only https ChatGPT pages as chat URLs", () => {
    expect(isChatUrl("https://chatgpt.com/c/6ae94331-8210-83ed-ac3b-428326e3b985")).toBe(true);
    expect(isChatUrl("https://chatgpt.com/")).toBe(true);
    expect(isChatUrl("http://chatgpt.com/c/1")).toBe(false);
    expect(isChatUrl("https://chatgpt.com.evil.io/c/1")).toBe(false);
    expect(isChatUrl("")).toBe(false);
  });

  it("tells a conversation page from the new-chat page", () => {
    expect(isConversationUrl("https://chatgpt.com/c/6ae9-83ed")).toBe(true);
    expect(isConversationUrl("https://chatgpt.com/g/g-abc/c/zz1")).toBe(true);
    expect(isConversationUrl("https://chatgpt.com/")).toBe(false);
    expect(isConversationUrl("https://evil.example/c/1")).toBe(false);
  });

  it("turns the settings into a run target, or names why it cannot run", () => {
    expect(webChatTargetOf({ ...DEFAULT_WEBCHAT_PREFS, url: "https://chatgpt.com/c/x", maxWaitMin: 2, readyTimeoutMin: 3 }))
      .toEqual({ ok: true, target: { url: "https://chatgpt.com/c/x", maxWaitMs: 120_000, readyTimeoutMs: 180_000 } });
    const bad = webChatTargetOf({ ...DEFAULT_WEBCHAT_PREFS, url: "https://example.com" });
    expect(bad.ok).toBe(false);
  });
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function input(fetchImpl: typeof fetch, over: Partial<WebChatInput> = {}): WebChatInput {
  return {
    bridgeUrl: "http://127.0.0.1:47391/", target: { url: "https://chatgpt.com/c/x", maxWaitMs: 600_000, readyTimeoutMs: 180_000 },
    prompt: "fix svg", image: PNG, sessionKey: "run-1", fetchImpl, pollMs: 5, ...over,
  };
}

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sendWebChat", () => {
  it("posts one turn and returns the reply text and chat URL", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return answer(200, { ok: true, text: "<svg/>", chatUrl: "https://chatgpt.com/c/x", restarted: false });
    }) as unknown as typeof fetch;
    const out = await sendWebChat(input(fetchImpl));
    expect(out).toEqual({ ok: true, text: "<svg/>", chatUrl: "https://chatgpt.com/c/x", restarted: false });
    expect(calls[0].url).toBe("http://127.0.0.1:47391/aichat/send");
    expect(calls[0].body).toMatchObject({ url: "https://chatgpt.com/c/x", prompt: "fix svg", image: PNG, maxWaitMs: 600_000, sessionKey: "run-1" });
  });

  it("reports the helper's failure with its code", async () => {
    const fetchImpl = (async () => answer(401, { ok: false, code: "auth", reason: "ChatGPT is not signed in" })) as unknown as typeof fetch;
    expect(await sendWebChat(input(fetchImpl))).toEqual({ ok: false, code: "auth", reason: "ChatGPT is not signed in" });
  });

  it("names an older helper and a helper that is not running", async () => {
    const old = (async () => answer(404, { reason: "not found" })) as unknown as typeof fetch;
    expect((await sendWebChat(input(old))).ok === false && (await sendWebChat(input(old)))).toMatchObject({ code: "helper-old" });
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await sendWebChat(input(down))).toMatchObject({ ok: false, code: "helper-down" });
  });

  it("polls progress while the turn runs and stops polling afterwards", async () => {
    const phases: string[] = [];
    let release: () => void = () => undefined;
    const fetchImpl = (async (url: RequestInfo | URL) => {
      if (String(url).includes("/aichat/progress")) return answer(200, { ok: true, busy: true, progress: { phase: "generating", at: 1 } });
      await new Promise<void>((r) => { release = r; });
      return answer(200, { ok: true, text: "<svg/>", chatUrl: null, restarted: true });
    }) as unknown as typeof fetch;
    const run = sendWebChat(input(fetchImpl, { onPhase: (p) => phases.push(p) }));
    await new Promise((r) => setTimeout(r, 30));
    release();
    const out = await run;
    expect(out).toMatchObject({ ok: true, chatUrl: null, restarted: true });
    expect(phases).toContain("generating");
  });

  it("asks the helper to cancel when the signal aborts", async () => {
    const controller = new AbortController();
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).endsWith("/aichat/send")) {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      return answer(200, { ok: true });
    }) as unknown as typeof fetch;
    const run = sendWebChat(input(fetchImpl, { signal: controller.signal, pollMs: 10_000 }));
    controller.abort();
    expect(await run).toMatchObject({ ok: false, code: "cancelled" });
    expect(urls.some((u) => u.endsWith("/aichat/cancel"))).toBe(true);
  });
});
