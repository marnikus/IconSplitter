// routes.mjs — loopback HTTP routes for the Getty Images / iStock *web* upload:
//   POST /getty-web/upload  (x-getty-web-config header + staged file bytes)
//   POST /getty-web/test    (sign in only, no batch, no files)
//   POST /getty-web/finish  (submit the one batch every icon was uploaded into)
//   POST /getty-web/close   (end the pooled browser session)
// Privacy (RULE 20): the log never sees credentials, file names or page text;
// every returned reason is scrubbed. The browser is launched by this helper on
// the same machine, and only after the user pressed Upload / Test.

import crypto from "node:crypto";
import { findBrowser } from "./browser.mjs";
import { openGettySession, releaseSession } from "./session.mjs";

const SESSION_IDLE_MS = 5 * 60 * 1000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_KEYWORDS = 49;
const MAX_KEYWORD = 64;
const MAX_SESSIONS = 2;
// Getty takes at most 100 uploads per batch: one icon (JPEG + optional EPS) is
// one upload, so the counted limit is icons, not files.
const MAX_ICONS = 100;
const MAX_FILES_PER_ICON = 2;
const GETTY_HOST = /(^|\.)gettyimages\.com$/i;
const sessions = new Map();

function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** The accepted metadata typed into the page; never anything the app did not send. */
export function sanitizeMetadata(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = cleanText(raw.title, MAX_TITLE);
  if (title === "") return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((k) => typeof k === "string").map((k) => cleanText(k, MAX_KEYWORD))
      .filter((k) => k !== "").slice(0, MAX_KEYWORDS)
    : [];
  return { title, description: cleanText(raw.description, MAX_DESCRIPTION), keywords };
}

/** `/health` capability block; never launches a browser. */
export function gettyWebHealth() {
  const browser = findBrowser();
  return { ready: true, browser: browser.found ? "found" : "missing", headed: process.env.GETTY_WEB_HEADED === "1" };
}

function scrub(text, cfg) {
  let out = typeof text === "string" && text.trim() !== "" ? text.trim() : "Getty web upload failed";
  for (const raw of [cfg?.password, cfg?.username]) {
    const secret = typeof raw === "string" ? raw.trim() : "";
    if (secret !== "") out = out.split(secret).join("••••••••");
  }
  return out.slice(0, 500);
}

function statusFor(code) {
  if (code === "bad-request") return 400;
  if (code === "auth") return 401;
  if (code === "browser") return 503;
  if (code === "timeout") return 504;
  if (code === "cancelled") return 499;
  return 502;
}

/** Only Getty contributor hosts, https only, no credentials in the URL. */
export function contributeUrlOf(cfg) {
  const host = String(cfg?.host ?? "").trim().toLowerCase();
  if (!GETTY_HOST.test(host)) return null;
  const dir = String(cfg?.remoteDir ?? "/contribute").replace(/\\/g, "/");
  const clean = cleanPath(dir);
  return clean === null ? null : `https://${host}${clean}`;
}

function cleanPath(dir) {
  const trimmed = dir.trim() === "" ? "/contribute" : dir.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("..") || /[\s?#]/.test(trimmed)) return null;
  return trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parseConfig(header) {
  if (typeof header !== "string" || header === "") return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validConfig(cfg) {
  if (!cfg || cfg.protocol !== "getty-web") return "this route drives the Getty web upload only";
  if (typeof cfg.username !== "string" || cfg.username.trim() === "" || typeof cfg.password !== "string" || cfg.password === "") {
    return "save the Getty contributor e-mail and password locally first";
  }
  const url = contributeUrlOf(cfg);
  return url === null ? "the Getty web target must be https on a gettyimages.com host" : null;
}

/** Sessions are pooled per browser profile + sign-in so a run logs in once. */
function poolKeyOf(cfg, url) {
  const raw = JSON.stringify([cfg.sessionKey ?? "", cfg.host, url, cfg.username, cfg.password, process.env.GETTY_WEB_HEADED === "1"]);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const headed = () => process.env.GETTY_WEB_HEADED === "1";

/** A session with a request in flight is never swept: one batch outlives 5 min. */
export function mayReleaseSession(entry) {
  return entry?.busy !== true;
}

function touch(key, entry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    // A long batch keeps its browser: re-arm instead of closing what is working.
    if (!mayReleaseSession(entry)) { touch(key, entry); return; }
    sessions.delete(key);
    releaseSession(entry.session, headed());
  }, SESSION_IDLE_MS);
  entry.timer.unref?.();
  sessions.set(key, entry);
}

async function acquireSession(cfg, url) {
  const key = poolKeyOf(cfg, url);
  const hit = sessions.get(key);
  if (hit) return { key, entry: hit, fresh: false };
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    const stale = sessions.get(oldest);
    sessions.delete(oldest);
    releaseSession(stale?.session, headed());
  }
  const opened = await openGettySession({
    url, creds: { username: cfg.username.trim(), password: cfg.password },
    headed: process.env.GETTY_WEB_HEADED === "1",
    profileDir: process.env.GETTY_WEB_PROFILE,
    uploadTimeoutMs: Number(process.env.GETTY_WEB_UPLOAD_TIMEOUT_MS ?? 180000),
    readyTimeoutMs: Number(process.env.GETTY_WEB_READY_TIMEOUT_MS ?? 300000),
  });
  const entry = {
    session: opened.ok ? opened.session : null, timer: null,
    sessionKey: typeof cfg.sessionKey === "string" ? cfg.sessionKey : null,
  };
  if (opened.ok) touch(key, entry);
  return { key, entry, fresh: true, failure: opened.ok ? null : opened };
}

/** Takes one icon's declared bytes from the front of `body`; null if short. */
function splitFiles(body, files) {
  const out = [];
  let offset = 0;
  for (const file of files) {
    const size = Number(file?.bytes ?? 0);
    if (!Number.isInteger(size) || size <= 0 || offset + size > body.length) return null;
    out.push({ name: String(file?.name ?? ""), bytes: body.subarray(offset, offset + size) });
    offset += size;
  }
  return out;
}

/** The icons of a request: the whole run in one call, or one legacy icon. */
export function iconsFromConfig(cfg) {
  if (Array.isArray(cfg?.icons)) {
    if (cfg.icons.length === 0 || cfg.icons.length > MAX_ICONS) return null;
    const icons = cfg.icons.map((icon) => ({
      files: Array.isArray(icon?.files) ? icon.files : [],
      metadata: sanitizeMetadata(icon?.metadata),
    }));
    const valid = icons.every((icon) => icon.files.length > 0 && icon.files.length <= MAX_FILES_PER_ICON);
    return valid ? icons : null;
  }
  const files = Array.isArray(cfg?.files) ? cfg.files : [];
  if (files.length === 0 || files.length > MAX_FILES_PER_ICON) return null;
  return [{ files, metadata: sanitizeMetadata(cfg?.metadata) }];
}

/** Reads every staged file of every icon out of the body, or why it cannot. */
export function iconsFromBody(body, cfg) {
  const icons = iconsFromConfig(cfg);
  if (!icons) return null;
  const out = [];
  let offset = 0;
  for (const icon of icons) {
    const files = splitFiles(body.subarray(offset), icon.files);
    if (!files) return null;
    if (!files.every((file) => /\.(jpe?g|eps)$/i.test(file.name))) return null;
    offset += files.reduce((sum, file) => sum + file.bytes.length, 0);
    out.push({ files, metadata: icon.metadata });
  }
  if (offset !== body.length) return null;
  return offset === body.length ? out : null;
}

async function performUpload(cfg, url, icons) {
  const acquired = await acquireSession(cfg, url);
  const session = acquired.entry.session;
  if (!session) return acquired.failure;
  touch(acquired.key, acquired.entry);
  acquired.entry.busy = true;
  try {
    const start = { batchName: cfg.batchName, submissionType: cfg.submissionType };
    // `newBatch` is one batch per chunk of a long run; without it the session
    // keeps the batch it already has (a run that fits in one batch).
    const batch = cfg.newBatch === true ? await session.startBatch(start) : await session.ensureBatch(start);
    if (!batch.ok) return batch;
    const uploaded = await session.upload({
      icons,
      // The run finishes each batch itself; nothing here may lock it early.
      complete: cfg.complete === true && process.env.GETTY_WEB_COMPLETE !== "0",
    });
    return { ...uploaded, batchId: batch.batchId };
  } finally {
    acquired.entry.busy = false;
    touch(acquired.key, acquired.entry);
  }
}

/**
 * What a failed upload may say: its code, its scrubbed reason, and the names the
 * page had already accepted or rejected. Names only — never page text, never a
 * credential — so a timed-out chunk is not re-sent whole.
 */
export function failurePayload(result, cfg) {
  const state = result?.state ?? null;
  return {
    ok: false,
    code: result?.code ?? "page",
    reason: scrub(result?.reason, cfg),
    state,
    accepted: state?.uploaded ?? [],
    failed: state?.failures ?? [],
    seen: state?.namesSeen ?? [],
  };
}

/**
 * `post` is the server's body reader, `json` its response writer, `limit` the
 * upload byte cap. Returns the bytes written, like the other bridge routes.
 */
export async function handleGettyWebUpload(req, res, post, json, limit) {
  const cfg = parseConfig(req.headers["x-getty-web-config"]);
  const invalid = validConfig(cfg);
  if (invalid !== null) return json(res, 400, { ok: false, code: "bad-request", reason: invalid });
  if (Number(req.headers["content-length"] ?? 0) > limit) {
    res.setHeader("connection", "close");
    return json(res, 413, { ok: false, code: "bad-request", reason: `the staged files exceed the helper's limit (${limit} bytes)` });
  }
  const body = await post(req, limit);
  if (body === null) return json(res, 413, { ok: false, code: "bad-request", reason: "the request body was too large" });
  const icons = iconsFromBody(body, cfg);
  if (!icons) return json(res, 400, { ok: false, code: "bad-request", reason: "the upload must contain a JPEG (and optional matching EPS) per icon" });
  const url = contributeUrlOf(cfg);
  try {
    const result = await performUpload(cfg, url, icons);
    if (!result?.ok) {
      return json(res, statusFor(result?.code ?? "page"), failurePayload(result, cfg));
    }
    return json(res, 200, {
      ok: true, batchId: result.batchId ?? null,
      // Only a card carrying Getty's "Ready to submit" icon counts: "Upload failed" is reported, never accepted.
      accepted: result.accepted ?? result.state?.uploaded ?? [],
      failed: result.failed ?? result.state?.failures ?? [],
      // Contributions Getty never marked "Ready to submit": named, so the app can
      // say which file is not submittable instead of counting it as uploaded.
      notReady: result.notReady ?? result.report?.readiness?.notReady ?? [],
      chips: result.state?.chips ?? null,
      completed: result.report?.completion?.clicked === true,
      // Every card carried Getty's "Ready to submit" icon: the batch is finished
      // even when the page offers no Complete control to click.
      ready: result.report?.readiness?.ok === true && result.report?.readiness?.verified !== false,
      completion: result.report?.completion ?? null,
      metadata: result.report?.metadata ?? [],
      submitted: result.state?.submitted === true,
    });
  } catch (err) {
    return json(res, 502, { ok: false, code: "page", reason: scrub(err?.message, cfg) });
  }
}

/**
 * `GET /getty-web/progress?sessionKey=…`: the live per-file counts of a running
 * upload, so the panel can show what Getty reports while it works. Counts only —
 * no file name, no page text, no credentials leave this route.
 */
export function handleGettyWebProgress(req, res, json) {
  const key = sessionKeyOf(req.url);
  const entry = [...sessions.values()].find((item) => item.sessionKey === key && item.session);
  if (!entry) return json(res, 404, { ok: false, code: "bad-request", reason: "no Getty upload is running for this run" });
  return json(res, 200, { ok: true, progress: entry.session.progress ?? null });
}

function sessionKeyOf(rawUrl) {
  try {
    const value = new URL(String(rawUrl ?? "/"), "http://127.0.0.1").searchParams.get("sessionKey");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Signs in and reports the batch surface, without creating anything. */
export async function handleGettyWebTest(req, res, post, json) {
  const body = await post(req, 65536);
  const cfg = parseConfig(body);
  const invalid = validConfig(cfg);
  if (invalid !== null) return json(res, 400, { ok: false, code: "bad-request", reason: invalid });
  try {
    const acquired = await acquireSession(cfg, contributeUrlOf(cfg));
    if (!acquired.entry.session) {
      const failure = acquired.failure;
      return json(res, statusFor(failure?.code), { ok: false, code: failure?.code ?? "browser", reason: scrub(failure?.reason, cfg) });
    }
    touch(acquired.key, acquired.entry);
    return json(res, 200, { ok: true, signedIn: true });
  } catch (err) {
    return json(res, 502, { ok: false, code: "page", reason: scrub(err?.message, cfg) });
  }
}

/**
 * `POST /getty-web/finish`: submits the run's single batch after the last icon.
 * Only an already-open session is used — a finish without uploads has nothing to
 * submit, and creating a browser here would only hide that.
 */
export async function handleGettyWebFinish(req, res, post, json) {
  const body = await post(req, 65536);
  const cfg = parseConfig(body);
  const invalid = validConfig(cfg);
  if (invalid !== null) return json(res, 400, { ok: false, code: "bad-request", reason: invalid });
  const url = contributeUrlOf(cfg);
  const key = poolKeyOf(cfg, url);
  const entry = sessions.get(key);
  if (!entry?.session) {
    return json(res, 409, {
      ok: false, code: "bad-request",
      reason: "no Getty batch is open for this run — upload at least one icon first",
    });
  }
  try {
    entry.busy = true;
    const result = await entry.session.finish({}).finally(() => { entry.busy = false; });
    touch(key, entry);
    if (!result?.ok) {
      const code = result?.code ?? "page";
      return json(res, statusFor(code), { ok: false, code, reason: scrub(result?.reason, cfg), state: result?.state ?? null });
    }
    const report = result.report ?? {};
    return json(res, 200, {
      ok: true, batchId: entry.session.batchId ?? null, accepted: [], completed: report.completion?.clicked === true,
      notReady: report.readiness?.notReady ?? [],
      ready: report.readiness?.ok === true && report.readiness?.verified !== false,
      completion: report.completion ?? null, metadata: [], contributions: report.contributions ?? null,
      submitted: report.state?.submitted === true,
    });
  } catch (err) {
    return json(res, 502, { ok: false, code: "page", reason: scrub(err?.message, cfg) });
  }
}

function parseCloseBody(body) {
  try { return JSON.parse(body ?? "{}"); } catch { return {}; }
}

/** Closes the pooled session for `sessionKey`, or every pooled session. */
export async function handleGettyWebClose(req, res, post, json) {
  const parsed = parseCloseBody(await post(req, 65536));
  const wanted = typeof parsed?.sessionKey === "string" && parsed.sessionKey !== "" ? parsed.sessionKey : null;
  for (const [key, entry] of sessions.entries()) {
    if (wanted !== null && entry.sessionKey !== wanted) continue;
    if (entry.timer) clearTimeout(entry.timer);
    releaseSession(entry.session, headed());
    sessions.delete(key);
  }
  return json(res, 200, { ok: true });
}
