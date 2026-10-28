// routes.mjs — loopback HTTP routes for `/ftps/test`, `/ftps/upload` and `/ftps/close`.
// Privacy (RULE 20): never logs credentials, hostnames, usernames or filenames;
// scrubs credentials from any returned error reason; aborts immediately on browser disconnect (RULE 7).

import crypto from "node:crypto";
import { openSftpSession } from "../sftp/client.mjs";
import { openFtpsSession } from "./client.mjs";
import { FtpsError, describeSocketError } from "./reply.mjs";

const SESSION_IDLE_MS = 15000;
const sessions = new Map();

function openTransportSession(cfg) {
  return cfg.protocol === "sftp" ? openSftpSession(cfg) : openFtpsSession(cfg);
}

function scrubSecrets(text, cfg) {
  let out = typeof text === "string" && text.trim() !== "" ? text.trim() : "Connection failed";
  for (const raw of [cfg?.password, cfg?.username]) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s !== "") out = out.split(s).join("••••••••");
  }
  return out;
}

function statusForCode(code) {
  if (code === "bad-request") return 400;
  if (code === "auth") return 401;
  if (code === "cert") return 495;
  if (code === "timeout") return 504;
  return 502;
}

function poolIdOf(cfg) {
  if (!cfg.sessionKey) return null;
  const raw = JSON.stringify([
    cfg.sessionKey, cfg.protocol, cfg.host, cfg.port, cfg.remoteDir,
    cfg.tlsPolicy, cfg.pinnedCertSha256, cfg.username, cfg.password,
  ]);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function touchPoolEntry(key, session) {
  const prev = sessions.get(key);
  if (prev?.timer) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    sessions.delete(key);
    void session.quit();
  }, SESSION_IDLE_MS);
  timer.unref?.();
  sessions.set(key, { session, sessionKey: prev?.sessionKey ?? null, timer });
}

async function acquireSession(cfg) {
  const key = poolIdOf(cfg);
  if (!key) return { session: await openTransportSession(cfg), pooled: false, key: null };
  const hit = sessions.get(key);
  if (hit && hit.session.isAlive()) {
    clearTimeout(hit.timer);
    return { session: hit.session, pooled: true, key };
  }
  if (hit) sessions.delete(key);
  const fresh = await openTransportSession(cfg);
  sessions.set(key, { session: fresh, sessionKey: cfg.sessionKey, timer: null });
  return { session: fresh, pooled: true, key };
}

function readBinaryBody(req, limit) {
  if (Number(req.headers["content-length"] ?? 0) > limit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { req.pause(); resolve(null); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== "object") throw new FtpsError("bad-request", "missing FTPS configuration");
  if (typeof cfg.host !== "string" || cfg.host.trim() === "") throw new FtpsError("bad-request", "missing FTPS host");
  if (typeof cfg.username !== "string" || cfg.username.trim() === "" || typeof cfg.password !== "string" || cfg.password === "") {
    throw new FtpsError("bad-request", "missing FTPS credentials");
  }
}

export async function handleFtpsTest(req, res, jsonReply) {
  const raw = await readBinaryBody(req, 64 * 1024);
  if (raw === null) return jsonReply(res, 413, { ok: false, code: "bad-request", reason: "config payload too large" });
  let cfg = null;
  try {
    cfg = JSON.parse(raw.toString("utf8"));
    validateConfig(cfg);
    const session = await openTransportSession(cfg);
    res.once("close", () => { if (!res.writableEnded) session.destroy(); });
    await session.noop();
    const cert = session.serverCertSha256;
    await session.quit();
    return jsonReply(res, 200, { ok: true, serverCertSha256: cert });
  } catch (err) {
    const code = err instanceof FtpsError ? err.code : "network";
    const cert = err instanceof FtpsError ? err.serverCertSha256 : null;
    return jsonReply(res, statusForCode(code), {
      ok: false, code, reason: scrubSecrets(describeSocketError(err, "Connection failed"), cfg), serverCertSha256: cert,
    });
  }
}

export async function handleFtpsUpload(req, res, maxBytes, jsonReply) {
  const header = req.headers["x-ftps-config"];
  if (typeof header !== "string" || header === "") {
    return jsonReply(res, 400, { ok: false, code: "bad-request", reason: "missing x-ftps-config header" });
  }
  let cfg = null;
  try {
    cfg = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    validateConfig(cfg);
  } catch (err) {
    const code = err instanceof FtpsError ? err.code : "bad-request";
    return jsonReply(res, 400, { ok: false, code, reason: scrubSecrets(err?.message, cfg) });
  }

  const body = await readBinaryBody(req, maxBytes);
  if (body === null) {
    res.setHeader("connection", "close");
    return jsonReply(res, 413, { ok: false, code: "bad-request", reason: `file exceeds helper limit (${maxBytes} bytes)` });
  }
  if (body.length === 0) {
    return jsonReply(res, 400, { ok: false, code: "bad-request", reason: "refusing to upload empty 0-byte file" });
  }

  let acquired = null;
  try {
    acquired = await acquireSession(cfg);
    let killActive = () => acquired?.session.destroy();
    res.once("close", () => { if (!res.writableEnded) killActive(); });
    await acquired.session.uploadFile(cfg.fileName, body, (fn) => { killActive = fn; });
    if (acquired.pooled && acquired.key) touchPoolEntry(acquired.key, acquired.session);
    else await acquired.session.quit();
    return jsonReply(res, 200, { ok: true, bytes: body.length });
  } catch (err) {
    if (acquired?.key) sessions.delete(acquired.key);
    acquired?.session.destroy();
    const code = err instanceof FtpsError ? err.code : "network";
    const cert = err instanceof FtpsError ? err.serverCertSha256 : null;
    return jsonReply(res, statusForCode(code), {
      ok: false, code, reason: scrubSecrets(describeSocketError(err, "Upload failed"), cfg), serverCertSha256: cert,
    });
  }
}

export async function handleFtpsClose(req, res, jsonReply) {
  const raw = await readBinaryBody(req, 16 * 1024);
  let sessionKey = null;
  try {
    sessionKey = raw ? JSON.parse(raw.toString("utf8"))?.sessionKey : null;
  } catch { /* ignore */ }
  const closing = [];
  for (const [k, entry] of sessions.entries()) {
    if (!sessionKey || entry.sessionKey === sessionKey) {
      if (entry.timer) clearTimeout(entry.timer);
      sessions.delete(k);
      closing.push(entry.session.quit());
    }
  }
  await Promise.allSettled(closing);
  return jsonReply(res, 200, { ok: true });
}
