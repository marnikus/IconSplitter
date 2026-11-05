// @vitest-environment node
// The ChatGPT web turn, driven against a fake page: ready/login wait, attach,
// type, submit, wait for a NEW stable reply, the file-card follow-up, the
// max-wait restart in a new chat and cancellation. No browser, no chatgpt.com.

import { describe, expect, it } from "vitest";
import { chatIdOf, chatUrlOf, jitteredDelay, replyProgress, runChatTurn } from "../tools/bridge/aichat/chatflow.mjs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>';

interface Reading {
  signedIn: boolean; ready: boolean; busy: boolean; attached: boolean;
  reply: { id: string; text: string; file: boolean } | null; href: string;
  notice?: string | null;
  prompts?: number;
}

/** A scripted page: every `read()` returns the next reading after the send. */
function fakePage(opts: { before?: Partial<Reading>; after?: Partial<Reading>[]; afterRestart?: Partial<Reading>[]; loginReads?: number } = {}) {
  const log: string[] = [];
  let sent = 0;
  let afterIndex = 0;
  let loginLeft = opts.loginReads ?? 0;
  let restarted = false;
  const base: Reading = { signedIn: true, ready: true, busy: false, attached: false, reply: { id: "old", text: "old answer", file: false }, href: "https://chatgpt.com/c/abc", ...opts.before };
  const page = {
    log,
    async open(url: string) { log.push(`open ${url}`); },
    async read(): Promise<Reading> {
      if (loginLeft > 0) { loginLeft -= 1; return { ...base, signedIn: false, ready: false }; }
      if (sent === 0) return { ...base, attached: log.includes("attach") };
      const script = (restarted ? opts.afterRestart : opts.after) ?? [];
      const step = script[Math.min(afterIndex, script.length - 1)] ?? {};
      afterIndex += 1;
      return { ...base, ...step };
    },
    async attach(file: string) { log.push("attach"); return { ok: file !== "" }; },
    async type(text: string) { log.push(`type ${text.slice(0, 12)}`); return true; },
    async submit() { log.push("submit"); sent += 1; afterIndex = 0; return { ok: true }; },
    async newChat() { log.push("newChat"); restarted = true; sent = 0; base.reply = null; base.href = "https://chatgpt.com/"; },
    async href() { return restarted ? "https://chatgpt.com/c/new-1" : "https://chatgpt.com/c/abc"; },
  };
  return page;
}

const fast = { pollMs: 1, attachTimeoutMs: 50, stableReads: 2 };
const input = { url: "https://chatgpt.com/c/abc", prompt: "fix svg", imagePath: "/tmp/a.png", maxWaitMs: 200, readyTimeoutMs: 100 };

describe("chat URLs", () => {
  it("accepts only https chatgpt.com conversation pages", () => {
    expect(chatUrlOf("https://chatgpt.com/c/6ae94331-8210-83ed-ac3b-428326e3b985")).toBe("https://chatgpt.com/c/6ae94331-8210-83ed-ac3b-428326e3b985");
    expect(chatUrlOf("https://chatgpt.com/")).toBe("https://chatgpt.com/");
    expect(chatUrlOf("http://chatgpt.com/c/x")).toBeNull();
    expect(chatUrlOf("https://evil.example/c/x")).toBeNull();
    expect(chatUrlOf("https://user:pw@chatgpt.com/c/x")).toBeNull();
    expect(chatUrlOf("")).toBeNull();
  });
  it("reads the conversation id", () => {
    expect(chatIdOf("https://chatgpt.com/c/6ae9-83ed")).toBe("6ae9-83ed");
    expect(chatIdOf("https://chatgpt.com/g/g-x/c/zz1")).toBe("zz1");
    expect(chatIdOf("https://chatgpt.com/")).toBeNull();
  });
});

describe("replyProgress", () => {
  const reading = (text: string, busy = false) => ({ busy, reply: { id: "new", text, file: false } });
  it("waits for a new reply that stays the same while nothing is generating", () => {
    let s = replyProgress(null, reading(SVG), "old", 2);
    expect(s.done).toBe(false);
    s = replyProgress(s, reading(SVG), "old", 2);
    expect(s.done).toBe(true);
  });
  it("never accepts the reply that was there before the send", () => {
    let s = replyProgress(null, { busy: false, reply: { id: "old", text: SVG, file: false } }, "old", 1);
    s = replyProgress(s, { busy: false, reply: { id: "old", text: SVG, file: false } }, "old", 1);
    expect(s.done).toBe(false);
  });
  it("keeps waiting while the stop button shows or the text still grows", () => {
    let s = replyProgress(null, reading(SVG, true), "old", 1);
    s = replyProgress(s, reading(SVG, true), "old", 1);
    expect(s.done).toBe(false);
    s = replyProgress(null, reading("<svg"), "old", 1);
    s = replyProgress(s, reading(SVG), "old", 1);
    expect(s.done).toBe(false);
  });
  it("accepts a reply without SVG only after twice the stable reads", () => {
    let s = replyProgress(null, reading("I cannot"), "old", 2);
    s = replyProgress(s, reading("I cannot"), "old", 2);
    expect(s.done).toBe(false);
    s = replyProgress(s, reading("I cannot"), "old", 2);
    s = replyProgress(s, reading("I cannot"), "old", 2);
    expect(s.done).toBe(true);
  });
});

describe("runChatTurn", () => {
  it("attaches, types, submits and returns the new reply text", async () => {
    const page = fakePage({ after: [{ busy: true, reply: { id: "n1", text: "<svg", file: false } }, { reply: { id: "n1", text: SVG, file: false } }] });
    const phases: string[] = [];
    const out = await runChatTurn(page, input, { ...fast, onPhase: (p: string) => phases.push(p) });
    expect(out).toMatchObject({ ok: true, text: SVG, chatUrl: "https://chatgpt.com/c/abc", restarted: false });
    expect(page.log).toEqual(["open https://chatgpt.com/c/abc", "attach", "type fix svg", "submit"]);
    expect(phases).toEqual(["opening", "uploading", "typing", "generating", "scraping"]);
  });

  it("reports waiting-for-login and fails as auth when the composer never appears", async () => {
    const page = fakePage({ loginReads: 10_000 });
    const phases: string[] = [];
    const out = await runChatTurn(page, input, { ...fast, onPhase: (p: string) => phases.push(p) });
    expect(out).toMatchObject({ ok: false, code: "auth" });
    expect(phases).toContain("waiting-for-login");
  });

  it("continues once the user has signed in", async () => {
    const page = fakePage({ loginReads: 3, after: [{ reply: { id: "n1", text: SVG, file: false } }] });
    const out = await runChatTurn(page, input, fast);
    expect(out.ok).toBe(true);
  });

  it("restarts in a new chat once when no reply arrives in time and reports the new URL", async () => {
    const page = fakePage({ after: [{ busy: true }], afterRestart: [{ reply: { id: "r1", text: SVG, file: false } }] });
    const phases: string[] = [];
    const out = await runChatTurn(page, { ...input, maxWaitMs: 30 }, { ...fast, onPhase: (p: string) => phases.push(p) });
    expect(out).toMatchObject({ ok: true, restarted: true, chatUrl: "https://chatgpt.com/c/new-1" });
    expect(page.log.filter((l) => l === "submit")).toHaveLength(2);
    expect(phases).toContain("restarting-chat");
  });

  it("fails as timeout when the new chat does not answer either", async () => {
    const page = fakePage({ after: [{ busy: true }], afterRestart: [{ busy: true }] });
    const out = await runChatTurn(page, { ...input, maxWaitMs: 20 }, fast);
    expect(out).toMatchObject({ ok: false, code: "timeout" });
    expect(page.log.filter((l) => l === "newChat")).toHaveLength(1);
  });

  it("asks once for inline code when the reply is a file card", async () => {
    let asked = false;
    const page = fakePage({ after: [{ reply: { id: "f1", text: "icon.svg", file: true } }] });
    const type = page.type.bind(page);
    page.type = async (text: string) => { if (text.includes("inline")) asked = true; return type(text); };
    const out = await runChatTurn(page, input, fast);
    expect(asked).toBe(true);
    expect(out).toMatchObject({ ok: false, code: "reply_was_file" });
  });

  it("stops at once when cancelled", async () => {
    const controller = new AbortController();
    const page = fakePage({ after: [{ busy: true }] });
    setTimeout(() => controller.abort(), 5);
    const out = await runChatTurn(page, { ...input, maxWaitMs: 5000 }, { ...fast, signal: controller.signal });
    expect(out).toMatchObject({ ok: false, code: "cancelled" });
    expect(page.log).not.toContain("newChat");
  });

  it("fails honestly when the image cannot be attached", async () => {
    const page = fakePage();
    const out = await runChatTurn(page, { ...input, imagePath: "" }, fast);
    expect(out).toMatchObject({ ok: false, code: "page" });
  });
});

describe("human-paced steps (2026-11-05)", () => {
  /** A page that stamps every action with the time it happened. */
  function timedPage() {
    const at: Record<string, number> = {};
    const page = fakePage({ after: [{ reply: { id: "n1", text: SVG, file: false } }] });
    const wrap = <K extends "attach" | "type" | "submit">(k: K) => {
      const real = page[k].bind(page) as (...a: unknown[]) => Promise<unknown>;
      (page as Record<string, unknown>)[k] = async (...a: unknown[]) => { at[k] ??= Date.now(); return real(...a); };
    };
    wrap("attach"); wrap("type"); wrap("submit");
    return { page, at };
  }

  it("pauses before attaching, before pasting and before clicking send", async () => {
    const { page, at } = timedPage();
    const started = Date.now();
    const out = await runChatTurn(page, { ...input, stepDelayMs: 60 }, { ...fast, random: () => 0.5 });
    expect(out.ok).toBe(true);
    expect(at.attach - started).toBeGreaterThanOrEqual(55);
    expect(at.type - at.attach).toBeGreaterThanOrEqual(55);
    expect(at.submit - at.type).toBeGreaterThanOrEqual(55);
  });

  it("does not pause when the setting is 0", async () => {
    const { page, at } = timedPage();
    const started = Date.now();
    await runChatTurn(page, { ...input, stepDelayMs: 0 }, fast);
    expect(at.submit - started).toBeLessThan(50);
  });

  it("varies each pause between 75 % and 125 % of the setting", () => {
    expect(jitteredDelay(1000, 0)).toBe(750);
    expect(jitteredDelay(1000, 0.5)).toBe(1000);
    expect(jitteredDelay(1000, 1)).toBe(1250);
    expect(jitteredDelay(0, 0.9)).toBe(0);
  });

  it("a Cancel during a pause stops the turn at once", async () => {
    const controller = new AbortController();
    const page = fakePage();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const out = await runChatTurn(page, { ...input, stepDelayMs: 5000 }, { ...fast, signal: controller.signal });
    expect(out).toMatchObject({ ok: false, code: "cancelled" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(page.log).not.toContain("attach");
  });
});

describe("ChatGPT's own limit notices (2026-11-05)", () => {
  const LIMIT = "You’re out of attachments for now. Start a free Plus trial for more, or try again after 11:47 PM.";

  it("stops before attaching when the page already shows a limit, quoting it", async () => {
    const page = fakePage({ before: { notice: LIMIT } as Partial<Reading> });
    const out = await runChatTurn(page, input, fast);
    expect(out).toMatchObject({ ok: false, code: "limit", reason: LIMIT });
    expect(page.log).not.toContain("attach");
    expect(page.log).not.toContain("newChat");
  });

  it("names the limit instead of a vague timeout when the image never appears", async () => {
    const page = fakePage();
    const reads = page.read.bind(page);
    let attachedCalls = 0;
    page.attach = async () => { page.log.push("attach"); return { ok: true }; };
    page.read = async () => {
      const r = await reads();
      attachedCalls += page.log.includes("attach") ? 1 : 0;
      return attachedCalls > 1 ? { ...r, attached: false, notice: LIMIT } : { ...r, attached: false };
    };
    const out = await runChatTurn(page, input, fast);
    expect(out).toMatchObject({ ok: false, code: "limit", reason: LIMIT });
  });

  it("a notice that appears next to a finished reply does not spoil that reply", async () => {
    const page = fakePage({ after: [{ reply: { id: "n1", text: SVG, file: false }, notice: LIMIT } as Partial<Reading>] });
    const out = await runChatTurn(page, input, fast);
    expect(out).toMatchObject({ ok: true, text: SVG });
  });
});

describe("anchored turns (2026-11-05)", () => {
  const anchored = { ...input, anchor: "Icon name (use it as the SVG <title>): fog_AI" };

  it("waits for its own prompt to appear, then for the answer below it", async () => {
    const reads: (string | undefined)[] = [];
    const page = fakePage({ after: [{ prompts: 1 } as Partial<Reading>, { prompts: 1, reply: { id: "n1", text: SVG, file: false } } as Partial<Reading>] });
    const read = page.read.bind(page);
    page.read = async (anchor?: string) => { reads.push(anchor); return read(); };
    const phases: string[] = [];
    const out = await runChatTurn(page, anchored, { ...fast, onPhase: (p: string) => phases.push(p) });
    expect(out).toMatchObject({ ok: true, text: SVG });
    expect(reads.every((a) => a === anchored.anchor)).toBe(true); // every reading is anchored
    expect(phases).toEqual(["opening", "uploading", "typing", "sent", "generating", "scraping"]);
  });

  it("fails honestly when its prompt never shows up in the chat", async () => {
    const page = fakePage({ after: [{ prompts: 0 } as Partial<Reading>] });
    const out = await runChatTurn(page, anchored, { ...fast, submitTimeoutMs: 40 });
    expect(out).toMatchObject({ ok: false, code: "page" });
    expect((out as { reason: string }).reason).toMatch(/prompt/);
    expect(page.log).not.toContain("newChat");
  });
});

describe("text-only turns (2026-11-05)", () => {
  it("types and sends without attaching when there is no image", async () => {
    const page = fakePage({ after: [{ reply: { id: "n1", text: SVG, file: false } }] });
    const phases: string[] = [];
    const out = await runChatTurn(page, { ...input, imagePath: null }, { ...fast, onPhase: (p: string) => phases.push(p) });
    expect(out).toMatchObject({ ok: true, text: SVG });
    expect(page.log).toEqual(["open https://chatgpt.com/c/abc", "type fix svg", "submit"]);
    expect(phases).not.toContain("uploading");
  });

  it("is not stopped by an attachment limit it does not need", async () => {
    const page = fakePage({ before: { notice: "You’re out of attachments for now." } as Partial<Reading>, after: [{ reply: { id: "n1", text: SVG, file: false } }] });
    const out = await runChatTurn(page, { ...input, imagePath: null }, fast);
    expect(out.ok).toBe(true);
  });
});
