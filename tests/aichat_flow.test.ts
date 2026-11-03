// @vitest-environment node
// The ChatGPT web turn, driven against a fake page: ready/login wait, attach,
// type, submit, wait for a NEW stable reply, the file-card follow-up, the
// max-wait restart in a new chat and cancellation. No browser, no chatgpt.com.

import { describe, expect, it } from "vitest";
import { chatIdOf, chatUrlOf, replyProgress, runChatTurn } from "../tools/bridge/aichat/chatflow.mjs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>';

interface Reading {
  signedIn: boolean; ready: boolean; busy: boolean; attached: boolean;
  reply: { id: string; text: string; file: boolean } | null; href: string;
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
