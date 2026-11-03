// @vitest-environment happy-dom
// The in-page ChatGPT steps against DOM fixtures shaped like the real page
// (2026-11-03 dumps): data-*/aria handles only, never hashed class names.

import { afterEach, describe, expect, it } from "vitest";
import { clickNewChat, clickSend, focusComposer, readChat, stepSource } from "../tools/bridge/aichat/chatpage.mjs";

const SVG_TEXT = '&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"&gt;&lt;path d="M0 0h10"/&gt;&lt;/svg&gt;';

function composer(opts: { attached?: boolean; send?: "enabled" | "disabled" | "none"; stop?: boolean } = {}): string {
  const attachments = opts.attached ? '<div data-composer-attachments=""><div><img alt="ref.png" src="blob:x"></div></div>' : '<div data-composer-attachments=""></div>';
  const send = opts.send === "enabled" ? '<button data-testid="send-button" aria-label="Send prompt">↑</button>'
    : opts.send === "disabled" ? '<button data-testid="send-button" aria-label="Send prompt" disabled>↑</button>' : '<button aria-label="Start Voice">v</button>';
  const stop = opts.stop ? '<button data-testid="stop-button" aria-label="Stop streaming">■</button>' : "";
  return `<form data-composer-placement="thread">${attachments}
    <input type="file" accept="image/*" multiple aria-label="Attach photos"><input type="file" accept="image/*" capture="environment">
    <div class="ProseMirror" contenteditable="true" role="textbox"><p></p></div>${send}${stop}</form>`;
}

function turn(key: string, role: "user" | "assistant", body: string): string {
  return `<section data-turn-key="${key}" data-talvt-turn-state="complete"><h4 data-conversation-role="${role}">${role}</h4>
    <div data-chatgpt-selection-message-id="m-${key}"><div data-markdown-text-style="${role}-message">${body}</div></div></section>`;
}

function page(turns: string, form: string): void {
  document.body.innerHTML = `<button aria-label="New chat">New</button><div role="region" aria-label="Conversation">${turns}</div>${form}`;
}

afterEach(() => { document.body.innerHTML = ""; });

describe("readChat", () => {
  it("reads the last assistant reply as plain text, with its turn key as id", () => {
    page(turn("t1", "user", "<p>fix svg</p>") + turn("t2", "assistant", `<p>${SVG_TEXT}</p>`), composer());
    const r = readChat();
    expect(r.signedIn).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.busy).toBe(false);
    expect(r.attached).toBe(false);
    expect(r.reply).toEqual({ id: "t2", text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>', file: false });
  });

  it("ignores a trailing user turn and reports null with no assistant turn", () => {
    page(turn("t1", "user", "<p>hi</p>"), composer());
    expect(readChat().reply).toBeNull();
  });

  it("sees an attached image, the stop button and a file card", () => {
    page(turn("t2", "assistant", '<div data-file-reference="f">icon.svg</div>'), composer({ attached: true, stop: true }));
    const r = readChat();
    expect(r.attached).toBe(true);
    expect(r.busy).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.reply?.file).toBe(true);
  });

  it("is not signed in without a composer", () => {
    document.body.innerHTML = '<button data-testid="login-button">Log in</button>';
    const r = readChat();
    expect(r.signedIn).toBe(false);
    expect(r.ready).toBe(false);
  });

  it("falls back to the classic message-author-role markup", () => {
    page('<div data-message-author-role="assistant" data-message-id="a9"><div class="markdown"><pre><code>&lt;svg&gt;&lt;/svg&gt;</code></pre></div></div>', composer());
    expect(readChat().reply).toMatchObject({ id: "a9", text: "<svg></svg>" });
  });
});

describe("composer actions", () => {
  it("focuses the ProseMirror textbox", () => {
    page("", composer());
    expect(focusComposer()).toBe(true);
    expect(document.activeElement?.getAttribute("role")).toBe("textbox");
  });

  it("clicks an enabled send button and refuses a disabled or missing one", () => {
    page("", composer({ send: "enabled" }));
    let clicked = false;
    document.querySelector('[data-testid="send-button"]')?.addEventListener("click", () => { clicked = true; });
    expect(clickSend()).toEqual({ ok: true });
    expect(clicked).toBe(true);
    page("", composer({ send: "disabled" }));
    expect(clickSend().ok).toBe(false);
    page("", composer({ send: "none" }));
    expect(clickSend()).toEqual({ ok: false, reason: "no-send-button" });
  });

  it("clicks New chat", () => {
    page("", composer());
    expect(clickNewChat()).toBe(true);
    document.body.innerHTML = "";
    expect(clickNewChat()).toBe(false);
  });

  it("serializes a step as a self-contained expression", () => {
    page(turn("t2", "assistant", "<p>x</p>"), composer());
    const value = (0, eval)(stepSource(readChat)) as { reply: { id: string } };
    expect(value.reply.id).toBe("t2");
  });
});
