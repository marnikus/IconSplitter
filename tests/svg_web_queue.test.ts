// svg_web_queue.test.ts — a LIVE WEB confirmation travels to the run
// (2026-11-03): no API key is needed for it, the queued batch keeps its frozen
// chat target, and the run's web transport writes a restarted chat's URL back
// into the stored setting.
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { guard } from "../src/svg/runplan";
import { confirmationProblem } from "../src/svg/runcontrol";
import { queueItem } from "../src/svg/runqueue";
import { webRunOf } from "../src/svg/runjobs";
import { loadWebChat, patchWebChat, WEBCHAT_KEY } from "../src/svg/webchatstore";
import type { SvgCtx } from "../src/svg/actions";
import type { RunCtx } from "../src/svg/runcontext";
import { FakeDir } from "./helpers/fakefs";

const TARGET = { url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000, readyTimeoutMs: 180_000 };

function ctx(key: string | null) {
  return {
    rows: [{ source: { id: "a" } }], m: { busy: null, config: { ...DEFAULT_CONFIG } },
    refs: { root: { current: new FakeDir("root") }, key: { current: key } },
  };
}

beforeEach(() => { localStorage.removeItem(WEBCHAT_KEY); });

describe("web mode needs no API key", () => {
  it("the guard asks for a key in API mode only", () => {
    expect(guard(ctx(null) as unknown as SvgCtx, ["a"])).toContain("API key");
    patchWebChat({ enabled: true });
    expect(guard(ctx(null) as unknown as SvgCtx, ["a"])).toBeNull();
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

  it("becomes the run's web transport, whose new chat URL replaces the stored one", () => {
    patchWebChat({ url: TARGET.url, enabled: true });
    const item = queueItem({ ids: ["a"], requests: 1, label: "a", web: TARGET });
    const web = webRunOf(item, () => undefined);
    expect(web?.target).toEqual(TARGET);
    web?.onChatUrl?.("https://chatgpt.com/c/new-1");
    expect(loadWebChat().url).toBe("https://chatgpt.com/c/new-1");
    expect(webRunOf(queueItem({ ids: ["a"], requests: 1, label: "a" }), () => undefined)).toBeUndefined();
  });
});
