// @vitest-environment node
// The bridge's ChatGPT turn pool (aichat/pool.mjs) and request parsing, with a fake page: one
// turn at a time, the staged PNG is removed afterwards, live progress, cancel,
// and the honest request refusals. No browser is launched.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAichat } from "../tools/bridge/aichat/pool.mjs";
import { parseSendBody, statusOfCode } from "../tools/bridge/aichat/routes.mjs";

const SVG = "<svg><path d=\"M0 0\"/></svg>";
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");

function fakeDeps(script: { replyAfter?: number; failOpen?: boolean } = {}) {
  const seen: { files: string[]; bytes: Buffer[]; opens: number; closes: number } = { files: [], bytes: [], opens: 0, closes: 0 };
  let sent = false;
  let submits = 0;
  let reads = 0;
  const page = {
    async open() {}, async href() { return "https://chatgpt.com/c/k1"; },
    async read() {
      reads += 1;
      const reply = sent && reads > (script.replyAfter ?? 0) ? { id: `n${submits}`, text: SVG, file: false } : null;
      return { signedIn: true, ready: true, busy: false, attached: seen.files.length > 0, reply };
    },
    async attach(file: string) { seen.files.push(file); seen.bytes.push(readFileSync(file)); return { ok: true }; },
    async type() { return true; },
    async submit() { sent = true; submits += 1; reads = 0; return { ok: true }; },
    async newChat() {},
  };
  const deps = {
    async open() {
      seen.opens += 1;
      if (script.failOpen) return { ok: false as const, code: "browser", reason: "no browser" };
      return { ok: true as const, page, close: () => { seen.closes += 1; } };
    },
    turnOptions: { pollMs: 1, stableReads: 2, attachTimeoutMs: 50 },
  };
  return { deps, seen };
}

const input = (over: Record<string, unknown> = {}) => ({
  url: "https://chatgpt.com/c/k1", prompt: "fix", image: Buffer.from(PNG_B64, "base64"),
  maxWaitMs: 500, readyTimeoutMs: 100, sessionKey: "s1", ...over,
});

describe("createAichat", () => {
  it("runs one turn, stages the PNG, then deletes it", async () => {
    const { deps, seen } = fakeDeps();
    const chat = createAichat(deps);
    const out = await chat.send(input());
    expect(out).toMatchObject({ ok: true, text: SVG, chatUrl: "https://chatgpt.com/c/k1" });
    expect(seen.files).toHaveLength(1);
    expect(seen.files[0]).toMatch(/\.png$/);
    expect(seen.bytes[0].subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(existsSync(seen.files[0])).toBe(false);
    expect(chat.busy()).toBe(false);
    expect(chat.progress("s1")?.phase).toBe("done");
  });

  it("reuses the open page for the next turn and closes it on request", async () => {
    const { deps, seen } = fakeDeps();
    const chat = createAichat(deps);
    await chat.send(input());
    await chat.send(input());
    expect(seen.opens).toBe(1);
    chat.close();
    expect(seen.closes).toBe(1);
  });

  it("refuses a second turn while one is running", async () => {
    const { deps } = fakeDeps({ replyAfter: 20 });
    const chat = createAichat(deps);
    const first = chat.send(input());
    expect(chat.busy()).toBe(true);
    expect(await chat.send(input())).toMatchObject({ ok: false, code: "busy" });
    await first;
  });

  it("cancels the running turn by session key", async () => {
    const { deps } = fakeDeps({ replyAfter: 100_000 });
    const chat = createAichat(deps);
    const run = chat.send(input({ maxWaitMs: 60_000 }));
    await new Promise((r) => setTimeout(r, 10));
    expect(chat.cancel("other")).toBe(false);
    expect(chat.cancel("s1")).toBe(true);
    expect(await run).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("keeps progress only for the latest turn, so a long session holds no history", async () => {
    const { deps } = fakeDeps();
    const chat = createAichat(deps);
    await chat.send(input({ sessionKey: "s1" }));
    await chat.send(input({ sessionKey: "s2" }));
    expect(chat.progress("s1")).toBeNull();
    expect(chat.progress("s2")?.phase).toBe("done");
  });

  it("never cancels without naming the turn", async () => {
    const { deps } = fakeDeps({ replyAfter: 100_000 });
    const chat = createAichat(deps);
    const controller = new AbortController();
    const run = chat.send(input({ maxWaitMs: 60_000, signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 10));
    expect(chat.cancel("")).toBe(false);
    controller.abort();
    expect(await run).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("reports a browser that cannot be opened", async () => {
    const { deps } = fakeDeps({ failOpen: true });
    const out = await createAichat(deps).send(input());
    expect(out).toMatchObject({ ok: false, code: "browser", reason: "no browser" });
  });
});

describe("parseSendBody", () => {
  const body = (over: Record<string, unknown> = {}) => JSON.stringify({
    url: "https://chatgpt.com/c/k1", prompt: "fix svg", image: `data:image/png;base64,${PNG_B64}`, maxWaitMs: 600000, readyTimeoutMs: 180000, sessionKey: "s1", ...over,
  });
  it("accepts a chat URL, a prompt and a PNG data URL", () => {
    const parsed = parseSendBody(body());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.image.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(parsed.input.maxWaitMs).toBe(600000);
  });
  it("carries the pause between steps: default 1 s, clamped to 0–10 s", () => {
    expect(parseSendBody(body()).ok && (parseSendBody(body()) as { input: { stepDelayMs: number } }).input.stepDelayMs).toBe(1000);
    const pick = (v: unknown) => { const r = parseSendBody(body({ stepDelayMs: v })); return r.ok ? r.input.stepDelayMs : null; };
    expect([pick(0), pick(2500), pick(-5), pick(99_999), pick("x")]).toEqual([0, 2500, 0, 10_000, 1000]);
  });

  it("carries the prompt's icon line as the anchor, bounded", () => {
    const pick = (v: unknown) => { const r = parseSendBody(body({ anchor: v })); return r.ok ? r.input.anchor : null; };
    expect(pick("Icon name (use it as the SVG <title>): fog_AI")).toBe("Icon name (use it as the SVG <title>): fog_AI");
    expect(pick(undefined)).toBe("");
    expect(pick(42)).toBe("");
    expect(pick("x".repeat(900))).toHaveLength(500);
  });

  it("clamps the waits into their safe ranges", () => {
    const parsed = parseSendBody(body({ maxWaitMs: 5, readyTimeoutMs: 1e12 }));
    expect(parsed.ok && parsed.input.maxWaitMs).toBe(60_000);
    expect(parsed.ok && parsed.input.readyTimeoutMs).toBe(1_800_000);
  });
  it("refuses a foreign URL, an empty prompt, a non-PNG image and bad JSON", () => {
    expect(parseSendBody(body({ url: "https://example.com/c/1" })).ok).toBe(false);
    expect(parseSendBody(body({ prompt: "  " })).ok).toBe(false);
    expect(parseSendBody(body({ image: Buffer.from("GIF89a").toString("base64") })).ok).toBe(false);
    expect(parseSendBody("{nope").ok).toBe(false);
    expect(parseSendBody(null).ok).toBe(false);
  });
  it("maps failure codes to HTTP statuses", () => {
    expect(statusOfCode("auth")).toBe(401);
    expect(statusOfCode("busy")).toBe(409);
    expect(statusOfCode("timeout")).toBe(504);
    expect(statusOfCode("cancelled")).toBe(499);
    expect(statusOfCode("browser")).toBe(503);
    expect(statusOfCode("reply_was_file")).toBe(422);
    expect(statusOfCode("limit")).toBe(429);
    expect(statusOfCode("page")).toBe(502);
  });
});
