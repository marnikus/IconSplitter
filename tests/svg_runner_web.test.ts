// svg_runner_web.test.ts — a generation run through the ChatGPT web page
// (2026-11-03): one icon per request whatever the configured size, the prompt
// and image go to the LOCAL helper (never the provider), a bare untitled SVG
// reply is saved as the next version, `<use>` copies are expanded, the version
// records "Web: chatgpt.com" with no cost, a new chat URL is reported back, and
// a helper failure fails only that request. Fake helper, in-memory FS.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor } from "../src/lib/modelcaps";
import { clearInflight } from "../src/svg/journal";
import { compositeLayout } from "../src/lib/svgcomposite";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import type { RegenPlan } from "../src/lib/svgregen";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { svgSource } from "./helpers/svgpair";
import { createWebTransport, WEB_MODEL } from "../src/svg/runweb";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`, hash: "h", layout: compositeLayout(sources.length), bytes: 10,
    })),
  };
});

const MIRRORED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="a" d="M10 10L40 40" fill="none" stroke="#000" stroke-width="4"/>'
  + '<use href="#a" transform="matrix(-1 0 0 1 100 0)"/></svg>';

function fixture(n: number): { root: FakeDir; sources: SvgSource[] } {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  const sources: SvgSource[] = [];
  for (let i = 1; i <= n; i += 1) {
    const name = `icon-${i}_AI.png`;
    arch.children.set(name, new FakeFile(name, 20, 3000 + i, "png"));
    sources.push(svgSource(`pair_${i}`, { name, fingerprint: `20:${3000 + i}` }));
  }
  root.children.set("architecture", arch);
  return { root, sources };
}

interface HelperCall { url: string; body: Record<string, unknown> }

function fakeHelper(reply: (call: number) => { status: number; body: unknown }) {
  const calls: HelperCall[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (!href.endsWith("/aichat/send")) return new Response(JSON.stringify({ ok: true, progress: null }), { status: 200 });
    calls.push({ url: href, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const out = reply(calls.length);
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
  });
  return { calls, fetchFn };
}

function webArgs(root: FakeDir, sources: SvgSource[], onChatUrl = vi.fn()) {
  const events: RunEvent[] = [];
  const config: SvgConfig = { ...DEFAULT_CONFIG, retries: 0, imagesPerRequest: 4 };
  return {
    events, onChatUrl,
    args: {
      root, apiKey: "", config, caps: capsFor(config.model), params: { temperature: null, maxTokens: 8_000, effort: "low" as const },
      prompt: "fix svg to match the reference", regen: { kind: "main" } as RegenPlan, sources, metas: new Map(),
      onEvent: (e: RunEvent) => events.push(e), signal: new AbortController().signal,
      web: createWebTransport({ url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000, readyTimeoutMs: 180_000, stepDelayMs: 0 }, { onChatUrl }),
    },
  };
}

async function svgText(root: FakeDir, source: SvgSource): Promise<string | null> {
  const dir = await root.getDirectoryHandle("architecture");
  const file = dir.children.get(`${source.stem}.svg`);
  return file instanceof FakeFile ? file.text : null;
}

afterEach(() => { vi.unstubAllGlobals(); clearInflight(); });

describe("runGeneration — web page transport", () => {
  it("sends one icon per request to the local helper and saves each bare SVG reply", async () => {
    const { root, sources } = fixture(2);
    const helper = fakeHelper(() => ({ status: 200, body: { ok: true, text: `Worked for 38s\n${MIRRORED}`, chatUrl: "https://chatgpt.com/c/abc", restarted: false } }));
    vi.stubGlobal("fetch", helper.fetchFn);
    const { args, onChatUrl } = webArgs(root, sources);
    const summary = await runGeneration(args);
    expect(summary.perRequest).toBe(1);
    expect(summary.batches).toBe(2);
    expect(summary.saved).toBe(2);
    expect(helper.calls).toHaveLength(2);
    expect(helper.calls[0].url).toBe("http://127.0.0.1:47391/aichat/send");
    expect(helper.calls[0].body).toMatchObject({ url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000 });
    expect(String(helper.calls[0].body.prompt)).toContain("fix svg to match the reference");
    // the anchor is exactly the icon line the prompt carries, so the helper finds THIS prompt
    expect(String(helper.calls[0].body.prompt)).toContain(String(helper.calls[0].body.anchor));
    expect(String(helper.calls[0].body.anchor)).toMatch(/^Request id: r-/);
    expect(String(helper.calls[0].body.prompt)).toContain("Icon name (use it as the SVG <title>): icon-1_AI");
    expect(String(helper.calls[0].body.image)).toBe("data:image/png;base64,architecture/icon-1_AI.png");
    const saved = await svgText(root, sources[0]);
    expect(saved).not.toContain("<use");
    expect(saved?.match(/<path/g)).toHaveLength(2);
    const meta = args.metas.get("pair_1") as { versions?: { provider: string; model: string; usage: { total: number | null }; cost: { actual: number | null; estimated: number | null } }[] } | undefined;
    expect(meta?.versions?.[0]?.provider).toBe("Web: chatgpt.com");
    // what really answered — never the configured API model, which was not called
    expect(meta?.versions?.[0]?.model).toBe(WEB_MODEL);
    expect(summary.outcomes[0].cost).toMatchObject({ actual: null, estimated: null });
    expect(meta?.versions?.[0]?.usage.total).toBeNull();
    expect(meta?.versions?.[0]?.cost).toMatchObject({ actual: null, estimated: null });
    expect(onChatUrl).not.toHaveBeenCalled();
  });

  it("reports a new chat URL so later requests and the saved setting use it", async () => {
    const { root, sources } = fixture(2);
    const helper = fakeHelper(() => ({ status: 200, body: { ok: true, text: MIRRORED, chatUrl: "https://chatgpt.com/c/new-1", restarted: true } }));
    vi.stubGlobal("fetch", helper.fetchFn);
    const { args, onChatUrl } = webArgs(root, sources);
    await runGeneration(args);
    expect(onChatUrl).toHaveBeenCalledWith("https://chatgpt.com/c/new-1");
    expect(helper.calls[1].body.url).toBe("https://chatgpt.com/c/new-1");
  });

  it("fails only the request the helper could not answer, with its reason", async () => {
    const { root, sources } = fixture(2);
    const helper = fakeHelper((n) => (n === 1
      ? { status: 401, body: { ok: false, code: "auth", reason: "ChatGPT is not signed in" } }
      : { status: 200, body: { ok: true, text: MIRRORED, chatUrl: null, restarted: false } }));
    vi.stubGlobal("fetch", helper.fetchFn);
    const { args } = webArgs(root, sources);
    const summary = await runGeneration(args);
    expect(summary.saved).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.problems[0]).toContain("ChatGPT is not signed in");
    expect(await svgText(root, sources[1])).toContain("<svg");
  });

  it("reports a reply without SVG as missing, never as a saved version", async () => {
    const { root, sources } = fixture(1);
    vi.stubGlobal("fetch", fakeHelper(() => ({ status: 200, body: { ok: true, text: "I cannot do that", chatUrl: null } })).fetchFn);
    const { args } = webArgs(root, sources);
    const summary = await runGeneration(args);
    expect(summary.saved).toBe(0);
    expect(summary.missing).toBe(1);
    expect(await svgText(root, sources[0])).toBeNull();
  });
});
