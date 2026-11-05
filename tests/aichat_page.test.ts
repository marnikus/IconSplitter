// @vitest-environment happy-dom
// The in-page ChatGPT steps against DOM fixtures shaped like the real page
// (2026-11-03 dumps): data-*/aria handles only, never hashed class names.

import { afterEach, describe, expect, it } from "vitest";
import { clickNewChat, clickReplyCopy, clickSend, focusComposer, readChat, stepSource } from "../tools/bridge/aichat/chatpage.mjs";

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

/**
 * Anchored reading (2026-11-05): the request names its icon in the prompt
 * ("Icon name (use it as the SVG <title>): <name>"). The reply is the first
 * ChatGPT answer BELOW the last prompt carrying that line — never simply the
 * newest answer on the page.
 */
const lineOf = (name: string) => `Icon name (use it as the SVG &lt;title&gt;): ${name}`;
const ANCHOR = (name: string) => `Icon name (use it as the SVG <title>): ${name}`;
function prompt(name: string, uid: string): string {
  return `<div class="block-a"><h4 data-conversation-role="user">You said:</h4><div data-chatgpt-search-message-ids="${uid}">
    <div data-user-message-bubble="true"><div data-markdown-text-tone="user-message"><p><span>fix svg</span></p>
    <p><span>${lineOf(name)}</span></p></div></div></div></div>`;
}
function answer(id: string, svgTitle: string): string {
  return `<div class="block-a"><div data-chatgpt-search-message-ids="${id}"><h4 data-conversation-role="assistant">ChatGPT said:</h4>
    <div data-chatgpt-selection-message-id="${id}"><div data-markdown-text-style="assistant-message"><p><span>&lt;svg&gt;&lt;title&gt;${svgTitle}&lt;/title&gt;&lt;/svg&gt;</span></p></div></div></div></div>`;
}
const chat = (inner: string) => { document.body.innerHTML = `<div role="region" aria-label="Conversation">${inner}</div>${composer()}`; };

describe("readChat anchored on the prompt's icon name", () => {
  it("takes the answer right below the matching prompt, not the newest answer on the page", () => {
    chat(prompt("icon-24_AI_03", "u1") + answer("r1", "icon-24_AI_03") + prompt("icon-25_AI_01", "u2") + answer("r2", "icon-25_AI_01"));
    const r = (0, eval)(stepSource(readChat, ANCHOR("icon-24_AI_03"))) as ReturnType<typeof readChat>;
    expect(r.prompts).toBe(1);
    expect(r.reply).toMatchObject({ id: "r1", text: "<svg><title>icon-24_AI_03</title></svg>" });
  });

  it("uses the LAST prompt for the icon: no answer yet below a re-sent prompt", () => {
    chat(prompt("icon-24_AI_03", "u1") + answer("r1", "old") + prompt("icon-24_AI_03", "u2"));
    const r = readChat(ANCHOR("icon-24_AI_03"));
    expect(r.prompts).toBe(2);
    expect(r.reply).toBeNull();
  });

  it("never takes the next prompt's answer when this prompt has none yet", () => {
    chat(prompt("icon-24_AI_03", "u1") + prompt("icon-25_AI_01", "u2") + answer("r2", "icon-25_AI_01"));
    expect(readChat(ANCHOR("icon-24_AI_03")).reply).toBeNull();
  });

  it("finds nothing when the prompt is not on the page", () => {
    chat(prompt("icon-25_AI_01", "u2") + answer("r2", "icon-25_AI_01"));
    const r = readChat(ANCHOR("icon-24_AI_03"));
    expect(r.prompts).toBe(0);
    expect(r.reply).toBeNull();
  });
});

/**
 * 2026-11-05 code-block replies, from the user's DOM: ChatGPT renders the SVG
 * as a code block in PREVIEW mode — the visible text is only the label "svg";
 * the code lives in [data-markdown-copy-text] (what its Copy button copies)
 * and in the preview <img src="data:image/svg+xml;utf8,…">.
 */
const CODE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" stroke="#000"><title>5984e99b-icon-35_AI_01</title><path d="M240 328V240"/></svg>';
const attr = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function codeBlockReply(opts: { copyText?: boolean; preview?: boolean; shownAsCode?: boolean }): string {
  const copy = opts.copyText === false ? "" : ` data-markdown-copy-text="${attr(`\n${CODE_SVG}\n`)}"`;
  const preview = opts.preview === false ? "" : `<div data-code-block-preview-pane="svg"><img alt="Image generated by the assistant" src="data:image/svg+xml;utf8,${encodeURIComponent(`\n${CODE_SVG}\n`)}"></div>`;
  const code = opts.shownAsCode ? `<pre><code>${attr(CODE_SVG)}</code></pre>` : "";
  return `<div class="block-a"><div data-chatgpt-search-message-ids="810c"><h4 data-conversation-role="assistant">ChatGPT said:</h4>
    <div data-chatgpt-selection-message-id="810c0e88"><div data-markdown-text-style="assistant-message"><div data-dil-message-id="810c0e88">
    <div data-client-defined-widget="code_block"><div data-code-block="true" data-markdown-copy="code-block"${copy}>
    <div data-markdown-copy="exclude"><div>svg</div><div data-code-block-controls="true"><button aria-label="Code"></button></div></div>
    ${preview}${code}</div></div></div></div></div></div></div>`;
}

describe("readChat on a code-block reply", () => {
  it("takes the code from the block's copy text when the block shows a preview", () => {
    chat(prompt("5984e99b-icon-35_AI_01", "u1") + codeBlockReply({}));
    const r = readChat(ANCHOR("5984e99b-icon-35_AI_01"));
    expect(r.reply?.id).toBe("810c0e88");
    expect(r.reply?.text).toBe(CODE_SVG);
  });

  it("falls back to the preview image's SVG data when there is no copy text", () => {
    chat(prompt("5984e99b-icon-35_AI_01", "u1") + codeBlockReply({ copyText: false }));
    expect(readChat(ANCHOR("5984e99b-icon-35_AI_01")).reply?.text).toBe(CODE_SVG);
  });

  it("does not see the SVG twice when the block is shown as code", () => {
    chat(prompt("5984e99b-icon-35_AI_01", "u1") + codeBlockReply({ shownAsCode: true }));
    const text = readChat(ANCHOR("5984e99b-icon-35_AI_01")).reply?.text ?? "";
    expect(text.match(/<svg/g)).toHaveLength(1);
  });

  it("still reads a plain-text reply as before", () => {
    chat(prompt("icon-24_AI_03", "u1") + answer("r1", "icon-24_AI_03"));
    expect(readChat(ANCHOR("icon-24_AI_03")).reply?.text).toBe("<svg><title>icon-24_AI_03</title></svg>");
  });
});

describe("a repeated job is told apart by its request id (2026-11-05)", () => {
  const promptRef = (name: string, ref: string, uid: string) => prompt(name, uid).replace(
    `<p><span>${lineOf(name)}</span></p>`, `<p><span>${lineOf(name)}</span></p><p><span>Request id: ${ref}</span></p>`);

  it("takes the answer below the prompt with ITS request id, even when the icon was sent twice", () => {
    chat(promptRef("icon-24_AI_03", "r-aaa", "u1") + answer("first", "icon-24_AI_03")
      + promptRef("icon-24_AI_03", "r-bbb", "u2") + answer("second", "icon-24_AI_03"));
    expect(readChat("Request id: r-aaa").reply?.id).toBe("first");
    expect(readChat("Request id: r-bbb").reply?.id).toBe("second");
    expect(readChat("Request id: r-bbb").prompts).toBe(1);
  });
});

describe("clickReplyCopy — ChatGPT's own Copy button as the last resort", () => {
  const copyButton = (label: string) => `<button aria-label="${label}">copy</button>`;

  it("clicks the Copy button of the answer below THIS prompt, never another answer's", () => {
    chat(prompt("icon-a", "u1") + answer("ra", "icon-a") + copyButton("Copy")
      + prompt("icon-b", "u2") + answer("rb", "icon-b") + copyButton("Copy"));
    const clicked: number[] = [];
    document.querySelectorAll('button[aria-label="Copy"]').forEach((b, i) => b.addEventListener("click", () => clicked.push(i)));
    expect(clickReplyCopy(ANCHOR("icon-b"))).toBe(true);
    expect(clicked).toEqual([1]);
    expect(clickReplyCopy(ANCHOR("icon-a"))).toBe(true);
    expect(clicked).toEqual([1, 0]);
  });

  it("prefers the code block's own copy control, and reports when there is none", () => {
    chat(prompt("icon-a", "u1") + answer("ra", "icon-a").replace("<p>", `<div data-code-block-controls="true"><button aria-label="Copy code">c</button></div><p>`));
    let hit = "";
    document.querySelector('button[aria-label="Copy code"]')?.addEventListener("click", () => { hit = "code"; });
    expect(clickReplyCopy(ANCHOR("icon-a"))).toBe(true);
    expect(hit).toBe("code");
    chat(prompt("icon-a", "u1"));
    expect(clickReplyCopy(ANCHOR("icon-a"))).toBe(false);
  });

  it("serializes with the shared reply finder, so it runs inside the page alone", () => {
    chat(prompt("icon-a", "u1") + answer("ra", "icon-a") + copyButton("Copy"));
    expect((0, eval)(stepSource(clickReplyCopy, ANCHOR("icon-a")))).toBe(true);
  });
});
