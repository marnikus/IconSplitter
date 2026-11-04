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

/**
 * ChatGPT's 2026-11-05 layout, from the user's DOM: no [data-turn-key] and no
 * [data-message-author-role]; turns are hashed-class blocks, roles live on
 * h4[data-conversation-role], the reply body is
 * [data-markdown-text-style="assistant-message"] with its id on
 * [data-chatgpt-selection-message-id]. The USER message also holds SVG code.
 */
const SVG_REPLY = '&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"&gt;&lt;title&gt;icon-24_AI_03&lt;/title&gt;&lt;path d="M61 141"/&gt;&lt;/svg&gt;';
function layout2026(opts: { reply?: boolean; notice?: string } = {}): string {
  const user = `<div class="block-BQZwFn"><h4 data-conversation-role="user"><span>You said:</span></h4>
    <div data-chatgpt-search-message-ids="u-1"><img alt="User attachment" src="blob:x">
    <div data-user-message-bubble="true"><div data-markdown-text-tone="user-message"><p><span>fix svg</span></p>
    <p><span>&lt;svg xmlns="http://www.w3.org/2000/svg"&gt;&lt;path d="M208 549"/&gt;&lt;/svg&gt;</span></p></div></div></div></div>`;
  const worked = '<div class="block-BQZwFn"><button><span>Worked for 55s</span></button></div>';
  const reply = opts.reply === false ? "" : `<div class="block-BQZwFn"><div data-chatgpt-search-message-ids="6147bb6c 6147bb6c">
    <h4 data-conversation-role="assistant"><span>ChatGPT said:</span></h4><div>
    <div data-chatgpt-selection-conversation-id="local-chatgpt:f3a5" data-chatgpt-selection-message-id="6147bb6c-7961">
    <div data-markdown-text-style="assistant-message"><div data-dil-message-id="6147bb6c-7961"><p data-d-component="text">
    <span data-d-stream-run="">${SVG_REPLY}</span></p></div></div></div></div></div></div>`;
  const notice = opts.notice ? `<div class="notice-xyz"><span>${opts.notice}</span><button>Try Plus free</button></div>` : "";
  return `<div role="region" aria-label="Conversation">${user}${worked}${reply}</div>${notice}${composer()}`;
}

describe("readChat on ChatGPT's 2026-11-05 layout", () => {
  it("finds ChatGPT's reply — not the user's SVG — with its message id", () => {
    document.body.innerHTML = layout2026();
    const r = readChat();
    expect(r.reply?.id).toBe("6147bb6c-7961");
    expect(r.reply?.text).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>icon-24_AI_03</title><path d="M61 141"/></svg>');
    expect(r.reply?.file).toBe(false);
    expect(r.notice).toBeNull();
  });

  it("has no reply while ChatGPT has not answered (the user's own SVG never counts)", () => {
    document.body.innerHTML = layout2026({ reply: false });
    expect(readChat().reply).toBeNull();
  });

  it("reports ChatGPT's limit notice in its own words", () => {
    document.body.innerHTML = layout2026({ notice: "You’re out of attachments for now. Start a free Plus trial for more, or try again after 11:47 PM." });
    expect(readChat().notice).toBe("You’re out of attachments for now. Start a free Plus trial for more, or try again after 11:47 PM.");
  });

  it("never mistakes the same words inside a chat message for a notice", () => {
    document.body.innerHTML = layout2026().replace("fix svg", "You’re out of attachments for now, said my friend");
    expect(readChat().notice).toBeNull();
  });
});
