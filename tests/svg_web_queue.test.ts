// svg_web_queue.test.ts — a LIVE WEB confirmation travels to the run
// (2026-11-03): no API key is needed for it, the queued batch keeps its frozen
// chat target, and the run's web transport writes a restarted chat's URL back
// into the stored setting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { guard } from "../src/svg/runplan";
import { confirmationProblem } from "../src/svg/runcontrol";
import { queueItem } from "../src/svg/runqueue";
import { webTransportOf } from "../src/svg/runjobs";
import { loadWebChat, patchWebChat, WEBCHAT_KEY } from "../src/svg/webchatstore";
import type { SvgCtx } from "../src/svg/actions";
import type { RunCtx } from "../src/svg/runcontext";
import { FakeDir } from "./helpers/fakefs";

const TARGET = { url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000, readyTimeoutMs: 180_000, stepDelayMs: 0 };

function ctx(key: string | null) {
  return {
    rows: [{ source: { id: "a" } }], m: { busy: null, config: { ...DEFAULT_CONFIG } },
    refs: { root: { current: new FakeDir("root") }, key: { current: key } },
  };
}

beforeEach(() => { localStorage.removeItem(WEBCHAT_KEY); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("web mode needs no API key", () => {
  it("the guard asks for a key only when the request needs one (API mode)", () => {
    patchWebChat({ enabled: true });
    // the stored mode is not a hidden input: the caller says whether a key is needed
    expect(guard(ctx(null) as unknown as SvgCtx, ["a"])).toContain("API key");
    expect(guard(ctx(null) as unknown as SvgCtx, ["a"], null, false)).toBeNull();
  });

  it("the confirmation accepts a missing key only for a web batch", () => {
    const c = ctx(null) as unknown as RunCtx;
    expect(confirmationProblem(c, ["a"])).toContain("API key");
    expect(confirmationProblem(c, ["a"], TARGET)).toBeNull();
  });
});

describe("the queued web batch", () => {
  it("keeps its frozen chat target; an API batch has none", () => {
    expect(queueItem({ ids: ["a"], requests: 1, label: "a", web: TARGET }).web).toEqual(TARGET);
    expect(queueItem({ ids: ["a"], requests: 1, label: "a" }).web).toBeNull();
  });

  it("becomes the run's web transport, whose new chat URL replaces the stored one", async () => {
    patchWebChat({ url: TARGET.url, enabled: true });
    const lines: string[] = [];
    const web = webTransportOf(queueItem({ ids: ["a"], requests: 1, label: "a", web: TARGET }), (line) => lines.push(line));
    expect(web?.provider()).toBe("Web: chatgpt.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, text: "<svg/>", chatUrl: "https://chatgpt.com/c/new-1", restarted: true }), { status: 200 })));
    const out = await web?.send({ prompt: "p", image: "data:image/png;base64,AA", key: "k", signal: new AbortController().signal });
    expect(out?.ok).toBe(true);
    expect(loadWebChat().url).toBe("https://chatgpt.com/c/new-1");
    expect(lines.some((l) => l.includes("new chat"))).toBe(true);
    expect(webTransportOf(queueItem({ ids: ["a"], requests: 1, label: "a" }), () => undefined)).toBeUndefined();
  });
});
