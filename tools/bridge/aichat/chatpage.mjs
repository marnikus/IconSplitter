// chatpage.mjs — the ChatGPT page as the turn flow (chatflow.mjs) sees it.
// The step functions below run INSIDE the page (serialized with `stepSource`),
// so each one is self-contained. They use only data-* / aria handles: ChatGPT's
// class names are build hashes that change between deploys (2026-11-03 dumps).
// `cdpChatPage` binds them to one CDP page session.
/* global document, location, atob */

import { evaluate, insertText, navigate, setFiles } from "../webdriver/cdp.mjs";
import { chatIdOf } from "./chatflow.mjs";

const IMAGE_INPUT = 'input[type="file"][accept*="image"]:not([capture])';
const NEW_CHAT_URL = "https://chatgpt.com/";

/**
 * Which answer belongs to the request (runs IN the page; shipped with every step
 * that needs it, see `stepSource`). With `anchor` — a line only this request's
 * prompt carries (its unique "Request id: …", 2026-11-05) — it is the first
 * answer BELOW the LAST prompt holding that line and above the next prompt;
 * without one, the newest answer. `count` = prompts holding the anchor.
 */
export function pickAnswer(anchor) {
  const all = (sel) => [...document.querySelectorAll(sel)];
  const firstFound = (sels) => sels.map(all).find((list) => list.length > 0) ?? [];
  const answers = firstFound(['[data-markdown-text-style="assistant-message"]', '[data-message-author-role="assistant"]']);
  const prompts = firstFound(["[data-user-message-bubble]", '[data-message-author-role="user"]',
    '[data-markdown-text-style="user-message"]', '[data-markdown-text-tone="user-message"]']);
  const below = (a, b) => (a.compareDocumentPosition(b) & 4) !== 0 && !a.contains(b); // b comes after a
  if (typeof anchor !== "string" || anchor === "") {
    return { el: answers[answers.length - 1] ?? null, n: answers.length, count: null, next: null };
  }
  const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
  const wanted = flat(anchor);
  const mine = prompts.filter((el) => flat(el.textContent).includes(wanted));
  const last = mine[mine.length - 1];
  if (last === undefined) return { el: null, n: 0, count: 0, next: null };
  const next = prompts.find((el) => below(last, el)) ?? null;
  const index = answers.findIndex((a) => below(last, a) && (next === null || below(a, next)));
  return { el: index < 0 ? null : answers[index], n: index + 1, count: mine.length, next };
}

/**
 * Everything the turn flow needs to know about the page, in one reading.
 * The reply is found by the one marker every ChatGPT layout seen so far keeps
 * on the answer body — [data-markdown-text-style="assistant-message"] — so a
 * layout without [data-turn-key] (2026-11-05) still yields the reply; the
 * older turn / author-role markup is the fallback. `notice` is ChatGPT's own
 * limit message ("out of attachments… try again after…"), read only from text
 * OUTSIDE the chat messages, so a prompt or reply quoting it never counts.
 *
 * Anchored (2026-11-05): with `anchor` - the prompt's own line "Icon name (use
 * it as the SVG <title>): <name>" - the reply is the first answer BELOW the
 * LAST prompt carrying that line (and above the next prompt), never just the
 * newest answer on the page; `prompts` counts the prompts carrying it, so the
 * flow can see its own prompt arrive.
 */
export function readChat(anchor) {
  const q = (sel, root = document) => root.querySelector(sel);
  const box = q('form[data-composer-placement="thread"] [contenteditable="true"][role="textbox"]')
    ?? q('#prompt-textarea[contenteditable="true"]') ?? q('[contenteditable="true"][role="textbox"]');
  const busy = q('button[data-testid="stop-button"], button[aria-label^="Stop" i]') !== null;
  const tray = q("[data-composer-attachments]");
  const attached = tray !== null && (tray.querySelector("img") !== null || tray.childElementCount > 0);
  const MESSAGE = "[data-chatgpt-search-message-ids], [data-turn-key], [data-message-author-role], [data-user-message-bubble], [data-markdown-text-style], [data-conversation-role], form";
  // A code block may show a PREVIEW (a picture): its code is then only in the
  // block's copy text, or in the preview image's SVG data URL (2026-11-05).
  const svgOfDataUrl = (src) => {
    const comma = src.indexOf(",");
    const data = src.slice(comma + 1);
    try { return /;base64/i.test(src.slice(0, comma)) ? atob(data) : decodeURIComponent(data); } catch { return ""; }
  };
  const codeOf = (body) => {
    const copies = [...body.querySelectorAll("[data-markdown-copy-text]")].map((el) => el.getAttribute("data-markdown-copy-text") ?? "");
    const copied = copies.filter((t) => t.trim() !== "");
    if (copied.length > 0) return copied.join("\n").trim();
    const previews = [...body.querySelectorAll('img[src^="data:image/svg+xml"]')].map((img) => svgOfDataUrl(img.getAttribute("src") ?? ""));
    const shown = previews.filter((t) => t.trim() !== "");
    return shown.length > 0 ? shown.join("\n").trim() : null;
  };
  const replyOf = (el, n) => {
    const body = el.matches('[data-markdown-text-style="assistant-message"]') ? el : el.querySelector(".markdown") ?? el;
    const id = el.closest("[data-turn-key]")?.getAttribute("data-turn-key")
      ?? el.closest("[data-chatgpt-selection-message-id]")?.getAttribute("data-chatgpt-selection-message-id")
      ?? el.closest("[data-message-id]")?.getAttribute("data-message-id") ?? `#${n}`;
    const unit = el.closest("[data-turn-key], [data-chatgpt-search-message-ids], [data-message-author-role]") ?? el;
    // Code first (copy text, then preview data); a plain-text reply keeps its visible text.
    const text = codeOf(body) ?? String(body.textContent ?? "").trim();
    return { id, text, file: unit.querySelector("[data-file-reference]") !== null };
  };
  const pick = pickAnswer(anchor);
  const found = { count: pick.count, reply: pick.el === null ? null : replyOf(pick.el, pick.n) };
  const limitNotice = () => {
    const LIMIT = /out of attachments|reached (?:the|your|our) [a-z ]*limit|usage cap|try again after/i;
    const walker = document.createTreeWalker(document.body, 4); // text nodes only
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const el = node.parentElement;
      if (el !== null && LIMIT.test(node.nodeValue ?? "") && el.closest(MESSAGE) === null) return String(el.textContent ?? "").trim().slice(0, 300);
    }
    return null;
  };
  return {
    signedIn: box !== null, ready: box !== null && !busy, busy, attached, reply: found.reply, prompts: found.count, notice: limitNotice(),
    href: String(location.href),
  };
}

/**
 * Clicks ChatGPT's own Copy control for the request's answer: the code block's
 * copy button first, else the answer's "Copy" action — only a button between
 * that answer and the next prompt, never another answer's (2026-11-05).
 */
export function clickReplyCopy(anchor) {
  const pick = pickAnswer(anchor);
  if (pick.el === null) return false;
  const COPY = 'button[aria-label="Copy"], button[aria-label="Copy code"], button[aria-label="Copy message"], button[data-testid="copy-turn-action-button"]';
  const below = (a, b) => (a.compareDocumentPosition(b) & 4) !== 0 && !a.contains(b);
  const inside = pick.el.querySelector(COPY);
  const after = [...document.querySelectorAll(COPY)].find((b) => below(pick.el, b) && (pick.next === null || below(b, pick.next))
    && b.closest("[data-user-message-bubble]") === null);
  const button = inside ?? after ?? null;
  if (button === null) return false;
  button.click();
  return true;
}

/** Puts the caret into the composer so `Input.insertText` lands there. */
export function focusComposer() {
  const box = document.querySelector('form[data-composer-placement="thread"] [contenteditable="true"][role="textbox"]')
    ?? document.querySelector('[contenteditable="true"][role="textbox"]');
  if (box === null) return false;
  box.focus();
  return true;
}

/** Presses the send button; a missing or disabled one is reported, not forced. */
export function clickSend() {
  const button = document.querySelector('button[data-testid="send-button"], button#composer-submit-button, button[aria-label^="Send" i]');
  if (button === null) return { ok: false, reason: "no-send-button" };
  if (button.disabled || button.getAttribute("aria-disabled") === "true") return { ok: false, reason: "send-disabled" };
  button.click();
  return { ok: true };
}

/** Opens a fresh conversation through the page's own button. */
export function clickNewChat() {
  const button = document.querySelector('button[aria-label="New chat"], a[aria-label="New chat"], [data-testid="create-new-chat-button"]');
  if (button === null) return false;
  button.click();
  return true;
}

/**
 * A step as one self-contained page expression, with its one JSON argument.
 * The shared reply finder travels along, so steps can call `pickAnswer`.
 */
export function stepSource(fn, arg) {
  const call = `(${fn.toString()})(${arg === undefined ? "" : JSON.stringify(arg)})`;
  return `(() => { const pickAnswer = ${pickAnswer.toString()}; return ${call}; })()`;
}

/** The ChatGPT page of one CDP session, in the shape chatflow.mjs drives. */
export function cdpChatPage(connection, sessionId) {
  const run = (fn, arg) => evaluate(connection, stepSource(fn, arg), sessionId);
  const href = async () => String(await evaluate(connection, "location.href", sessionId));
  return {
    href,
    async open(url) {
      const now = await href().catch(() => "");
      const same = chatIdOf(url) !== null && chatIdOf(url) === chatIdOf(now);
      if (!same) await navigate(connection, url, sessionId);
    },
    read: (anchor) => run(readChat, anchor),
    attach: (file) => setFiles(connection, [file], { selector: IMAGE_INPUT, sessionId }),
    async type(text) {
      if (!(await run(focusComposer))) return false;
      return insertText(connection, text, sessionId);
    },
    submit: () => run(clickSend),
    /**
     * The last resort for a reply that shows no SVG code: click its Copy
     * control and read the clipboard (granted to the chat page; the page is
     * told it has focus, which a clipboard read requires). Overwrites the
     * user's clipboard. null when nothing could be copied.
     */
    async copyReply(anchor) {
      const origin = new URL(await href()).origin;
      await connection.send("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => null);
      await connection.send("Page.bringToFront", {}, sessionId).catch(() => null);
      await connection.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId).catch(() => null);
      if (!(await run(clickReplyCopy, anchor))) return null;
      await new Promise((resolve) => setTimeout(resolve, 400));
      const text = await evaluate(connection, "navigator.clipboard.readText()", sessionId).catch(() => null);
      return typeof text === "string" ? text : null;
    },
    async newChat() {
      if (!(await run(clickNewChat))) await navigate(connection, NEW_CHAT_URL, sessionId);
    },
  };
}
