// chatflow.mjs — ONE turn of the ChatGPT web generation (2026-11-03), written
// against an abstract page so it can be proven without a browser:
//   open the chat → wait until the composer is usable (the user may still have
//   to sign in) → attach the image → type the prompt → submit → wait until a NEW
//   reply stops changing and nothing is generating → read its text.
// A reply that never arrives within `maxWaitMs` is retried ONCE in a new chat,
// whose URL is reported so the app can replace the saved one. A reply that is a
// file card gets one follow-up asking for inline code. Page text never leaves
// this module except as the returned reply.

const CHAT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const DEFAULTS = { pollMs: 1000, attachTimeoutMs: 90_000, stableReads: 3, submitTimeoutMs: 90_000 };
const INLINE_FOLLOW_UP = "Return the SVG code inline as plain text in your reply, not as a file or attachment.";

/** The chat page to open: https on a ChatGPT host, no credentials, else null. */
export function chatUrlOf(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return CHAT_HOSTS.has(url.hostname.toLowerCase()) ? url.href : null;
  } catch {
    return null;
  }
}

/** The conversation id of a `/c/<id>` URL, or null for a new-chat page. */
export function chatIdOf(raw) {
  const match = /\/c\/([A-Za-z0-9-]+)/.exec(String(raw ?? ""));
  return match ? match[1] : null;
}

/**
 * One poll of the reply wait. `prev` is the last state (null at first), the
 * reading comes from the page, `baseline` is the reply id seen before sending.
 * Done = a reply that is not the baseline, nothing generating, and the same text
 * for `stable` reads (twice as long when it carries no SVG and is no file).
 */
export function replyProgress(prev, reading, baseline, stable) {
  const reply = reading?.reply ?? null;
  const fresh = reply !== null && reply.id !== baseline && reading.busy !== true;
  if (!fresh) return { text: null, same: 0, done: false };
  const same = prev !== null && prev.text === reply.text ? prev.same + 1 : 1;
  const finished = reply.file === true || reply.text.includes("</svg>");
  // Seen unchanged at least twice: one sighting cannot tell "done" from "still streaming".
  const needed = Math.max(2, finished ? stable : stable * 2);
  return { text: reply.text, same, done: same >= needed, reply };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal?.removeEventListener?.("abort", done); resolve(); }
    signal?.addEventListener?.("abort", done, { once: true });
  });
}

const cancelled = () => ({ ok: false, code: "cancelled", reason: "the web generation was cancelled" });

/** Polls `read` until `test` is true; resolves the reading, or null on timeout/cancel. */
async function pollUntil(page, test, timeoutMs, o) {
  const deadline = Date.now() + timeoutMs;
  while (!o.signal?.aborted) {
    const reading = await page.read();
    if (test(reading)) return reading;
    if (Date.now() >= deadline) return null;
    await sleep(o.pollMs, o.signal);
  }
  return null;
}

/** Waits for a usable composer, saying so while the user still has to sign in. */
async function waitReady(page, timeoutMs, o) {
  let told = false;
  const reading = await pollUntil(page, (r) => {
    if (!r.signedIn && !told) { told = true; o.onPhase?.("waiting-for-login"); }
    return r.signedIn && r.ready;
  }, timeoutMs, o);
  if (o.signal?.aborted) return cancelled();
  if (reading !== null) return { ok: true, reading };
  return {
    ok: false, code: "auth",
    reason: told ? "ChatGPT is not signed in — sign in in the browser window the helper opened, then retry"
      : "the ChatGPT composer did not become ready in time",
  };
}

/** Puts the text into the composer and presses send once it is enabled. */
async function typeAndSubmit(page, text, o) {
  o.onPhase?.("typing");
  if (!(await page.type(text))) return { ok: false, code: "page", reason: "the prompt could not be typed into ChatGPT" };
  const deadline = Date.now() + o.submitTimeoutMs;
  while (!o.signal?.aborted) {
    const sent = await page.submit();
    if (sent.ok) return { ok: true };
    if (Date.now() >= deadline) return { ok: false, code: "page", reason: "the ChatGPT send button never became available" };
    await sleep(o.pollMs, o.signal);
  }
  return cancelled();
}

/** Waits for the new reply; null reply = timeout. */
async function waitReply(page, baseline, timeoutMs, o) {
  o.onPhase?.("generating");
  let state = null;
  const reading = await pollUntil(page, (r) => {
    state = replyProgress(state, r, baseline, o.stableReads);
    return state.done;
  }, timeoutMs, o);
  if (o.signal?.aborted) return cancelled();
  return reading === null ? { ok: false, code: "timeout", reason: "no finished ChatGPT reply in time" } : { ok: true, reply: state.reply };
}

async function attachImage(page, imagePath, o) {
  o.onPhase?.("uploading");
  const put = await page.attach(imagePath);
  if (!put.ok) return { ok: false, code: "page", reason: put.reason ?? "the image could not be attached to the ChatGPT composer" };
  const seen = await pollUntil(page, (r) => r.attached === true, o.attachTimeoutMs, o);
  if (o.signal?.aborted) return cancelled();
  return seen ? { ok: true } : { ok: false, code: "page", reason: "ChatGPT did not show the attached image in time" };
}

/** A file-card reply gets one follow-up asking for the code inline. */
async function inlineFollowUp(page, reply, maxWaitMs, o) {
  const typed = await typeAndSubmit(page, INLINE_FOLLOW_UP, o);
  if (!typed.ok) return typed;
  const again = await waitReply(page, reply.id, maxWaitMs, o);
  if (again.ok && again.reply.file !== true) return again;
  if (!again.ok && again.code === "cancelled") return again;
  return { ok: false, code: "reply_was_file", reason: "ChatGPT answered with a file instead of SVG code, also after asking for inline code" };
}

/** Attach → type → submit → wait, in the chat that is open now. */
async function sendOnce(page, input, o) {
  const before = await page.read();
  const baseline = before.reply?.id ?? null;
  const attached = await attachImage(page, input.imagePath, o);
  if (!attached.ok) return attached;
  const typed = await typeAndSubmit(page, input.prompt, o);
  if (!typed.ok) return typed;
  const answer = await waitReply(page, baseline, input.maxWaitMs, o);
  if (!answer.ok || answer.reply.file !== true) return answer;
  return inlineFollowUp(page, answer.reply, input.maxWaitMs, o);
}

/** Opens the chat, waits for it, sends, and on a timeout retries once in a new chat. */
export async function runChatTurn(page, input, options = {}) {
  const o = { ...DEFAULTS, ...options };
  o.onPhase?.("opening");
  await page.open(input.url);
  const ready = await waitReady(page, input.readyTimeoutMs, o);
  if (!ready.ok) return ready;
  let answer = await sendOnce(page, input, o);
  let restarted = false;
  if (!answer.ok && answer.code === "timeout") {
    o.onPhase?.("restarting-chat");
    restarted = true;
    await page.newChat();
    const again = await waitReady(page, input.readyTimeoutMs, o);
    answer = again.ok ? await sendOnce(page, input, o) : again;
  }
  if (!answer.ok) return { ...answer, restarted };
  o.onPhase?.("scraping");
  return { ok: true, text: answer.reply.text, chatUrl: await page.href(), restarted };
}
