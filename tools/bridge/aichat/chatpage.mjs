// chatpage.mjs — the ChatGPT page as the turn flow (chatflow.mjs) sees it.
// The step functions below run INSIDE the page (serialized with `stepSource`),
// so each one is self-contained. They use only data-* / aria handles: ChatGPT's
// class names are build hashes that change between deploys (2026-11-03 dumps).
// `cdpChatPage` binds them to one CDP page session.
/* global document, location */

import { evaluate, insertText, navigate, setFiles } from "../webdriver/cdp.mjs";
import { chatIdOf } from "./chatflow.mjs";

const IMAGE_INPUT = 'input[type="file"][accept*="image"]:not([capture])';
const NEW_CHAT_URL = "https://chatgpt.com/";

/**
 * Everything the turn flow needs to know about the page, in one reading.
 * The reply is found by the one marker every ChatGPT layout seen so far keeps
 * on the answer body — [data-markdown-text-style="assistant-message"] — so a
 * layout without [data-turn-key] (2026-11-05) still yields the reply; the
 * older turn / author-role markup is the fallback. `notice` is ChatGPT's own
 * limit message ("out of attachments… try again after…"), read only from text
 * OUTSIDE the chat messages, so a prompt or reply quoting it never counts.
 */
export function readChat() {
  const q = (sel, root = document) => root.querySelector(sel);
  const box = q('form[data-composer-placement="thread"] [contenteditable="true"][role="textbox"]')
    ?? q('#prompt-textarea[contenteditable="true"]') ?? q('[contenteditable="true"][role="textbox"]');
  const busy = q('button[data-testid="stop-button"], button[aria-label^="Stop" i]') !== null;
  const tray = q("[data-composer-attachments]");
  const attached = tray !== null && (tray.querySelector("img") !== null || tray.childElementCount > 0);
  const MESSAGE = "[data-chatgpt-search-message-ids], [data-turn-key], [data-message-author-role], [data-user-message-bubble], [data-markdown-text-style], [data-conversation-role], form";
  const latestReply = () => {
    const bodies = [...document.querySelectorAll('[data-markdown-text-style="assistant-message"]')];
    if (bodies.length > 0) {
      const body = bodies[bodies.length - 1];
      const id = body.closest("[data-turn-key]")?.getAttribute("data-turn-key")
        ?? body.closest("[data-chatgpt-selection-message-id]")?.getAttribute("data-chatgpt-selection-message-id")
        ?? body.closest("[data-message-id]")?.getAttribute("data-message-id") ?? `#${bodies.length}`;
      const unit = body.closest("[data-turn-key], [data-chatgpt-search-message-ids], [data-message-author-role]") ?? body;
      return { id, text: String(body.textContent ?? "").trim(), file: unit.querySelector("[data-file-reference]") !== null };
    }
    const authors = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const last = authors[authors.length - 1];
    if (last === undefined) return null;
    const text = (last.querySelector(".markdown") ?? last).textContent;
    return { id: last.getAttribute("data-message-id") ?? `#${authors.length}`, text: String(text ?? "").trim(), file: last.querySelector("[data-file-reference]") !== null };
  };
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
    signedIn: box !== null, ready: box !== null && !busy, busy, attached, reply: latestReply(), notice: limitNotice(),
    href: String(location.href),
  };
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

/** A step as one self-contained page expression. */
export function stepSource(fn) {
  return `(${fn.toString()})()`;
}

/** The ChatGPT page of one CDP session, in the shape chatflow.mjs drives. */
export function cdpChatPage(connection, sessionId) {
  const run = (fn) => evaluate(connection, stepSource(fn), sessionId);
  const href = async () => String(await evaluate(connection, "location.href", sessionId));
  return {
    href,
    async open(url) {
      const now = await href().catch(() => "");
      const same = chatIdOf(url) !== null && chatIdOf(url) === chatIdOf(now);
      if (!same) await navigate(connection, url, sessionId);
    },
    read: () => run(readChat),
    attach: (file) => setFiles(connection, [file], { selector: IMAGE_INPUT, sessionId }),
    async type(text) {
      if (!(await run(focusComposer))) return false;
      return insertText(connection, text, sessionId);
    },
    submit: () => run(clickSend),
    async newChat() {
      if (!(await run(clickNewChat))) await navigate(connection, NEW_CHAT_URL, sessionId);
    },
  };
}
