// chatpage.mjs — the ChatGPT page as the turn flow (chatflow.mjs) sees it.
// The step functions below run INSIDE the page (serialized with `stepSource`),
// so each one is self-contained. They use only data-* / aria handles: ChatGPT's
// class names are build hashes that change between deploys (2026-11-03 dumps).
// `cdpChatPage` binds them to one CDP page session.
/* global document, location */

import { evaluate, insertText, navigate, setFiles } from "../gettyweb/cdp.mjs";
import { chatIdOf } from "./chatflow.mjs";

const IMAGE_INPUT = 'input[type="file"][accept*="image"]:not([capture])';
const NEW_CHAT_URL = "https://chatgpt.com/";

/** Everything the turn flow needs to know about the page, in one reading. */
export function readChat() {
  const q = (sel, root = document) => root.querySelector(sel);
  const box = q('form[data-composer-placement="thread"] [contenteditable="true"][role="textbox"]')
    ?? q('#prompt-textarea[contenteditable="true"]') ?? q('[contenteditable="true"][role="textbox"]');
  const busy = q('button[data-testid="stop-button"], button[aria-label^="Stop" i]') !== null;
  const tray = q("[data-composer-attachments]");
  const attached = tray !== null && (tray.querySelector("img") !== null || tray.childElementCount > 0);
  const roleOf = (el) => el.querySelector("[data-conversation-role]")?.getAttribute("data-conversation-role")
    ?? el.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") ?? null;
  const turns = [...document.querySelectorAll("[data-turn-key]")];
  const pool = turns.length > 0
    ? turns.filter((el) => roleOf(el) === "assistant")
    : [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const last = pool[pool.length - 1] ?? null;
  let reply = null;
  if (last !== null) {
    const body = last.querySelector('[data-markdown-text-style="assistant-message"]') ?? last.querySelector(".markdown") ?? last;
    const id = last.getAttribute("data-turn-key") ?? last.getAttribute("data-message-id")
      ?? last.querySelector("[data-chatgpt-selection-message-id]")?.getAttribute("data-chatgpt-selection-message-id") ?? String(pool.length);
    reply = { id, text: String(body.textContent ?? "").trim(), file: last.querySelector("[data-file-reference]") !== null };
  }
  return { signedIn: box !== null, ready: box !== null && !busy, busy, attached, reply, href: String(location.href) };
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
