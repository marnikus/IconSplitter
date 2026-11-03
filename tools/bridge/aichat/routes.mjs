// routes.mjs — loopback routes of the ChatGPT web SVG generation (2026-11-03):
//   POST /aichat/send      { url, prompt, image (PNG base64), maxWaitMs, readyTimeoutMs, sessionKey }
//   GET  /aichat/progress?sessionKey=…   the live phase of the running turn
//   POST /aichat/cancel    { sessionKey }  stop the running turn
//   POST /aichat/close     let go of the browser page
// Privacy (RULE 20): the log sees method, status and bytes only — never the
// prompt, the image, the chat URL or the reply. The browser opens only after
// the user confirmed a web generation in the app.

/* global AbortController */
import { findBrowser } from "../gettyweb/browser.mjs";
import { chatUrlOf } from "./chatflow.mjs";
import { aichatHeaded, aichatProfileDir, createAichat } from "./session.mjs";

const MAX_PROMPT = 400_000;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
export const AICHAT_MAX_BODY = 40 * 1024 * 1024;
const WAIT = { min: 60_000, max: 3_600_000, fallback: 600_000 };
const READY = { min: 10_000, max: 1_800_000, fallback: 180_000 };
const PNG_MAGIC = "89504e47";

const pool = createAichat();

function clamp(value, range) {
  const n = Number(value);
  if (!Number.isFinite(n)) return range.fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

function pngOf(raw) {
  if (typeof raw !== "string") return null;
  const b64 = raw.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES) return null;
  return bytes.subarray(0, 4).toString("hex") === PNG_MAGIC ? bytes : null;
}

function parsed(text) {
  try {
    const value = JSON.parse(String(text));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** The one turn a request may ask for, or the reason it is refused. */
export function parseSendBody(text) {
  const raw = typeof text === "string" ? parsed(text) : null;
  if (raw === null) return { ok: false, reason: "the request body is not a JSON object" };
  const url = chatUrlOf(raw.url);
  if (url === null) return { ok: false, reason: "the chat URL must be an https://chatgpt.com/ page" };
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  if (prompt.trim() === "" || prompt.length > MAX_PROMPT) return { ok: false, reason: "the prompt is empty or too long" };
  const image = pngOf(raw.image);
  if (image === null) return { ok: false, reason: "the reference image must be one PNG" };
  return {
    ok: true,
    input: {
      url, prompt, image, maxWaitMs: clamp(raw.maxWaitMs, WAIT), readyTimeoutMs: clamp(raw.readyTimeoutMs, READY),
      sessionKey: typeof raw.sessionKey === "string" ? raw.sessionKey.slice(0, 100) : "",
    },
  };
}

const STATUS = { "bad-request": 400, auth: 401, busy: 409, reply_was_file: 422, cancelled: 499, browser: 503, timeout: 504 };

export function statusOfCode(code) {
  return STATUS[code] ?? 502;
}

/** `/health` block; never launches a browser. */
export function aichatHealth(env = process.env) {
  return { ready: true, browser: findBrowser(env).found ? "found" : "missing", headed: aichatHeaded(env), profile: aichatProfileDir(env) };
}

/** A turn in flight: the helper must not restart under it. */
export function aichatBusy() {
  return pool.busy();
}

function keyOf(rawUrl) {
  try {
    return new URL(String(rawUrl ?? "/"), "http://127.0.0.1").searchParams.get("sessionKey") ?? "";
  } catch {
    return "";
  }
}

export async function handleAichatSend(req, res, post, json) {
  const body = await post(req, AICHAT_MAX_BODY);
  if (body === null) return json(res, 413, { ok: false, code: "bad-request", reason: "the image and prompt exceed the helper's limit" });
  const request = parseSendBody(body);
  if (!request.ok) return json(res, 400, { ok: false, code: "bad-request", reason: request.reason });
  // The app went away (closed tab, cancelled fetch): stop driving the page.
  const controller = new AbortController();
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  const out = await pool.send({ ...request.input, signal: controller.signal });
  if (!out.ok) return json(res, statusOfCode(out.code), { ok: false, code: out.code, reason: String(out.reason ?? "").slice(0, 300), restarted: out.restarted === true });
  return json(res, 200, { ok: true, text: out.text, chatUrl: chatUrlOf(out.chatUrl), restarted: out.restarted === true });
}

export function handleAichatProgress(req, res, json) {
  return json(res, 200, { ok: true, busy: pool.busy(), progress: pool.progress(keyOf(req.url)) });
}

export async function handleAichatCancel(req, res, post, json) {
  const raw = parsed(await post(req, 65536)) ?? {};
  const key = typeof raw.sessionKey === "string" ? raw.sessionKey : "";
  return json(res, 200, { ok: true, cancelled: pool.cancel(key) });
}

export async function handleAichatClose(req, res, post, json) {
  await post(req, 65536);
  pool.close();
  return json(res, 200, { ok: true });
}
