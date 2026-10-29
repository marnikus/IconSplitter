// client.mjs — Getty Images / iStock ESP (`api.gettyimages.com/esp`) session.
//
// Implements the REAL ESP contributor protocol (Getty ESP API tutorial + code
// examples), not the public Getty v3 search API:
//   1. OAuth2 *password* grant — requires BOTH an ESP-issued API key/secret
//      (`client_id`/`client_secret`) AND the ESP username/password. Getty's
//      shared auth service is tried at `authentication.gettyimages.com`
//      (current developer docs), then the historical ESP token paths on
//      `api.gettyimages.com` — moving on only when the endpoint itself is gone
//      (HTTP 404/405), never on a credential/grant refusal.
//   2. Every ESP call sends `Authorization: Token token=<access_token>` (NOT
//      Bearer — that is the v3 customer API scheme and ESP answers 401) plus
//      `Api-Key: <api key>` and JSON content type.
//   3. Files enter through the Ingestion v1 multipart flow: initiate a
//      contribution (`file_name` = EPS/vector slot, `raster_file_name` = JPG
//      slot of the SAME iStock-illustration contribution), authorize each
//      ≥5 MB chunk by its SHA-256 hex digest, PUT the chunk to the returned
//      S3 `upload_url` with the returned headers, collect the `ETag`, then
//      complete the upload with the ETag list. Contributions stay as drafts
//      in the submission batch (metadata extraction is asynchronous); submit
//      them for review in ESP — this client never auto-submits.
// Every failure is stage-tagged with the full server detail (HTTP status,
// OAuth `error`/`error_description`, ESP `message`/`errors`, or a body
// excerpt) so the helper console and the UI can show the exact codes.
// Secrets are scrubbed from every message before it leaves this module.
//
// Implements the pooled transport session contract (`noop`, `uploadFile`,
// `quit`, `destroy`, `isAlive`). `BRIDGE_ESP_CHUNK_BYTES` overrides the
// 10 MB S3 part size (loopback test knob; real S3 parts must stay ≥ 5 MB).

import crypto from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { FtpsError, assertSafeCommandToken, assertSafeFileName } from "../ftps/reply.mjs";
import { espHttpsRequest, probeEspTls } from "./http.mjs";

const DEFAULT_BATCHES_PATH = "/esp/submission/v1/submission_batches";
const DEFAULT_UPLOAD_BUCKET = "oregon";
const DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;
const DETAIL_BODY_MAX = 240;

function chunkBytesOf() {
  const raw = Number(process.env.BRIDGE_ESP_CHUNK_BYTES ?? DEFAULT_CHUNK_BYTES);
  if (!Number.isFinite(raw)) return DEFAULT_CHUNK_BYTES;
  return Math.min(DEFAULT_CHUNK_BYTES, Math.max(16, Math.floor(raw)));
}

function mimeForFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".eps") || lower.endsWith(".ai")) return "application/postscript";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function isRasterFile(fileName) {
  return /\.(jpe?g|png)$/i.test(fileName);
}

function parseJsonSafe(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function scrubText(text, secrets) {
  let out = String(text ?? "");
  for (const raw of secrets) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s !== "") out = out.split(s).join("••••••••");
  }
  return out;
}

/** ESP Rails validation payloads: `{errors:{field:[msg]}}`, arrays, or a string. */
function flattenEspErrors(errors) {
  if (typeof errors === "string") return errors.trim();
  if (Array.isArray(errors)) return errors.map((e) => String(e)).join("; ");
  if (errors && typeof errors === "object") {
    return Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : String(msgs)}`)
      .join("; ");
  }
  return "";
}

function bodyExcerpt(bodyBuf) {
  const text = bodyBuf.toString("utf8").replace(/\s+/g, " ").trim();
  return text.length > DETAIL_BODY_MAX ? `${text.slice(0, DETAIL_BODY_MAX)}…` : text;
}

/**
 * Builds the one FtpsError shape every ESP stage fails with: stage name,
 * HTTP status, and ALL server-provided codes/messages (OAuth error pair,
 * ESP message + validation errors, WWW-Authenticate, or raw body excerpt).
 */
function espFailure(stage, res, fallback, secrets) {
  const parsed = parseJsonSafe(res.body);
  const parts = [`Getty ESP ${stage} failed (HTTP ${res.status})`];
  const oauthError = typeof parsed?.error === "string" ? parsed.error.trim() : "";
  const oauthDesc = typeof parsed?.error_description === "string" ? parsed.error_description.trim() : "";
  if (oauthError !== "") parts.push(`error=${oauthError}`);
  if (oauthDesc !== "") parts.push(oauthDesc);
  if (typeof parsed?.message === "string" && parsed.message.trim() !== "") parts.push(parsed.message.trim());
  const flat = flattenEspErrors(parsed?.errors);
  if (flat !== "") parts.push(`errors: ${flat}`);
  const wwwAuth = res.headers?.["www-authenticate"];
  if (typeof wwwAuth === "string" && wwwAuth.trim() !== "") parts.push(`www-authenticate: ${wwwAuth.trim()}`);
  if (parts.length === 1) {
    const excerpt = bodyExcerpt(res.body);
    parts.push(excerpt !== "" ? `${fallback} — body: ${excerpt}` : fallback);
  }
  const authStatus = res.status === 401 || res.status === 403 || (stage === "oauth-token" && res.status === 400);
  const message = scrubText(parts.join(" — "), secrets);
  return new FtpsError(authStatus ? "auth" : "ftp", message, null, { stage, httpStatus: res.status });
}

function missingEspFields(cfg) {
  const missing = [];
  if (typeof cfg.username !== "string" || cfg.username.trim() === "") missing.push("ESP username");
  if (typeof cfg.password !== "string" || cfg.password === "") missing.push("ESP password");
  if (typeof cfg.apiKey !== "string" || cfg.apiKey.trim() === "") missing.push("Getty API Key (client_id)");
  if (typeof cfg.apiSecret !== "string" || cfg.apiSecret === "") missing.push("Getty API Secret (client_secret)");
  return missing;
}

export function assertEspCredentials(cfg) {
  const missing = missingEspFields(cfg ?? {});
  if (missing.length === 0) return;
  throw new FtpsError(
    "bad-request",
    `Getty ESP credentials incomplete — missing ${missing.join(", ")}. ESP login requires your ESP username + password AND an ESP-enabled Getty API Key + API Secret (issued by the Getty ESP API team); a contributor login alone cannot connect.`,
    null,
    { stage: "esp-credentials", httpStatus: null },
  );
}

function resolveBatchesTarget(remoteDir) {
  const clean = typeof remoteDir === "string" && remoteDir.trim() !== "" ? remoteDir.trim().replace(/\/+$/, "") : "";
  if (clean === "" || clean === "/") return { basePath: DEFAULT_BATCHES_PATH, explicitBatchId: null };
  const m = /^(.*\/submission_batches)\/([^/]+)$/.exec(clean);
  if (m) return { basePath: m[1], explicitBatchId: m[2] };
  if (clean.endsWith("/submission_batches")) return { basePath: clean, explicitBatchId: null };
  return { basePath: DEFAULT_BATCHES_PATH, explicitBatchId: clean.replace(/^\/+/, "") };
}

function apiBaseOf(basePath) {
  return basePath.replace(/\/submission\/v1\/submission_batches$/, "") || "/esp";
}

function tokenTargetsFor(host, port) {
  if (/gettyimages\.com$/i.test(host)) {
    return [
      { host: "authentication.gettyimages.com", port: 443, path: "/oauth2/token" },
      { host: "api.gettyimages.com", port: 443, path: "/oauth2/token" },
      { host: "api.gettyimages.com", port: 443, path: "/auth/oauth2/token" },
    ];
  }
  return [{ host, port: Number(port), path: "/oauth2/token" }];
}

function tokenTlsFor(conn, targetHost) {
  if (targetHost === conn.host) return { tlsPolicy: conn.tlsPolicy, pinnedCertSha256: conn.pinnedCertSha256 };
  // Getty's auth hosts present their own CA-issued certificates; a pin taken
  // for api.gettyimages.com must not be applied to them.
  return { tlsPolicy: conn.tlsPolicy === "accept-self-signed" ? "accept-self-signed" : "strict", pinnedCertSha256: "" };
}

async function fetchOAuthToken(conn, cfg, secrets) {
  const form = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.apiKey.trim(),
    client_secret: cfg.apiSecret,
    username: cfg.username,
    password: cfg.password,
  }).toString();
  const payload = Buffer.from(form, "utf8");
  let lastError = null;
  for (const target of tokenTargetsFor(conn.host, conn.port)) {
    let res;
    try {
      res = await espHttpsRequest({
        ...target, ...tokenTlsFor(conn, target.host), timeoutMs: conn.timeoutMs,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "content-length": payload.length },
        body: payload,
      });
    } catch (err) {
      lastError = err;
      if (err instanceof FtpsError && err.code === "cert") throw err;
      continue; // endpoint unreachable — try the next known auth host/path
    }
    const json = parseJsonSafe(res.body);
    if (res.status >= 200 && res.status < 300 && typeof json?.access_token === "string") {
      return { accessToken: json.access_token, headerApiKey: cfg.apiKey.trim() };
    }
    lastError = espFailure("oauth-token", res, "Getty OAuth2 token exchange failed", secrets);
    if (res.status !== 404 && res.status !== 405) throw lastError;
  }
  throw lastError ?? new FtpsError("network", "Getty OAuth2 token exchange failed: no auth endpoint answered", null, { stage: "oauth-token", httpStatus: null });
}

function espApiHeaders(auth, extra = {}) {
  return {
    accept: "application/json",
    "api-key": auth.headerApiKey,
    authorization: `Token token=${auth.accessToken}`,
    ...extra,
  };
}

function jsonRequest(conn, auth, method, path, payloadObj, onAbortHook) {
  const body = payloadObj === null ? undefined : Buffer.from(JSON.stringify(payloadObj), "utf8");
  return espHttpsRequest({
    ...conn, method, path,
    headers: espApiHeaders(auth, body ? { "content-type": "application/json", "content-length": body.length } : {}),
    body, onAbortHook,
  });
}

export async function openEspSession(cfg) {
  const {
    host = "api.gettyimages.com", port = 443, remoteDir = DEFAULT_BATCHES_PATH,
    tlsPolicy = "strict", pinnedCertSha256 = "", timeoutMs = 30000, username, password,
  } = cfg;
  assertSafeCommandToken(host, "host");
  assertSafeCommandToken(username, "username");
  assertSafeCommandToken(password, "password");
  assertEspCredentials(cfg);

  const secrets = [cfg.password, cfg.apiSecret, cfg.apiKey, cfg.username];
  const serverCertSha256 = await probeEspTls(host, Number(port), tlsPolicy, pinnedCertSha256, timeoutMs);
  const conn = { host, port: Number(port), tlsPolicy, pinnedCertSha256, timeoutMs };
  const auth = await fetchOAuthToken(conn, cfg, secrets);
  secrets.push(auth.accessToken);
  const { basePath, explicitBatchId } = resolveBatchesTarget(remoteDir);
  const ingestionPath = `${apiBaseOf(basePath)}/ingestion/v1/contributions`;
  const uploadBucket = typeof cfg.uploadBucket === "string" && cfg.uploadBucket.trim() !== "" ? cfg.uploadBucket.trim() : DEFAULT_UPLOAD_BUCKET;
  const contributionsByStem = new Map();
  let activeBatchId = explicitBatchId;
  let closed = false;

  async function ensureBatch() {
    if (activeBatchId) return activeBatchId;
    const today = new Date().toISOString().slice(0, 10);
    const res = await jsonRequest(conn, auth, "POST", basePath, {
      submission_name: `IconSplitter ${today}`,
      submission_type: "getty_creative_still",
      save_extracted_metadata: true,
    });
    const parsed = parseJsonSafe(res.body);
    const id = parsed?.id ?? parsed?.submission_batch?.id;
    if (res.status < 200 || res.status >= 300 || !id) {
      throw espFailure("esp-batch-create", res, "Getty ESP submission batch creation failed", secrets);
    }
    activeBatchId = String(id);
    return activeBatchId;
  }

  async function initiateContribution(batchId, safeName, raster, pair) {
    const payload = { submission_batch_id: batchId, upload_bucket: uploadBucket };
    const mainName = pair?.epsFileName ?? (raster ? null : safeName);
    const rasterName = pair?.rasterFileName ?? (raster ? safeName : null);
    if (mainName) { payload.file_name = mainName; payload.mime_type = mimeForFile(mainName); }
    if (rasterName) { payload.raster_file_name = rasterName; payload.raster_mime_type = mimeForFile(rasterName); }
    const res = await jsonRequest(conn, auth, "POST", ingestionPath, payload);
    const parsed = parseJsonSafe(res.body);
    const id = parsed?.contribution_id ?? parsed?.id;
    if (res.status < 200 || res.status >= 300 || !id) {
      throw espFailure("esp-ingest-initiate", res, "Getty ESP ingestion initiate failed", secrets);
    }
    return String(id);
  }

  async function authorizeChunk(contributionId, chunk, partNumber, raster, onAbortHook) {
    const sha = crypto.createHash("sha256").update(chunk).digest("hex");
    const q = new URLSearchParams({
      id: contributionId, encrypted_payload: sha, part_number: String(partNumber), raster_file: String(raster),
    });
    const res = await jsonRequest(conn, auth, "GET", `${ingestionPath}/${encodeURIComponent(contributionId)}/authorize_chunk?${q}`, null, onAbortHook);
    const parsed = parseJsonSafe(res.body);
    if (res.status < 200 || res.status >= 300 || typeof parsed?.upload_url !== "string") {
      throw espFailure("esp-chunk-authorize", res, "Getty ESP chunk authorization failed", secrets);
    }
    return parsed;
  }

  async function putChunk(chunkData, chunk, partNumber, onAbortHook) {
    const u = new URL(chunkData.upload_url);
    if (u.protocol !== "https:") {
      throw new FtpsError("bad-request", `Getty ESP s3-chunk-put refused a non-HTTPS upload_url for part ${partNumber}`, null, { stage: "s3-chunk-put", httpStatus: null });
    }
    const headers = {};
    const rawHeaders = chunkData.headers && typeof chunkData.headers === "object" ? chunkData.headers : {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = String(v);
    if (headers["content-length"] === undefined) headers["content-length"] = chunk.length;
    const sameHost = u.hostname === conn.host;
    const res = await espHttpsRequest({
      host: u.hostname, port: u.port ? Number(u.port) : 443, timeoutMs: conn.timeoutMs,
      tlsPolicy: sameHost ? tlsPolicy : (tlsPolicy === "accept-self-signed" ? "accept-self-signed" : "strict"),
      pinnedCertSha256: sameHost ? pinnedCertSha256 : "",
      method: "PUT", path: `${u.pathname}${u.search}`, headers, body: chunk, onAbortHook,
    });
    if (res.status < 200 || res.status >= 300) throw espFailure("s3-chunk-put", res, `S3 chunk PUT failed for part ${partNumber}`, secrets);
    const etag = res.headers?.etag;
    if (typeof etag !== "string" || etag.trim() === "") {
      throw new FtpsError("ftp", `Getty ESP s3-chunk-put part ${partNumber} answered HTTP ${res.status} without an ETag header`, null, { stage: "s3-chunk-put", httpStatus: res.status });
    }
    return etag;
  }

  async function uploadChunks(contributionId, buffer, raster, onAbortHook) {
    const size = chunkBytesOf();
    const etags = [];
    for (let off = 0, part = 1; off < buffer.length; off += size, part += 1) {
      const chunk = buffer.subarray(off, Math.min(buffer.length, off + size));
      const chunkData = await authorizeChunk(contributionId, chunk, part, raster, onAbortHook);
      const etag = await putChunk(chunkData, chunk, part, onAbortHook);
      etags.push({ part_number: String(part), etag });
    }
    return etags;
  }

  async function completeUpload(contributionId, etags, raster, onAbortHook) {
    const res = await jsonRequest(conn, auth, "PUT", `${ingestionPath}/${encodeURIComponent(contributionId)}`, {
      id: contributionId, etags, raster_file: raster,
    }, onAbortHook);
    if (res.status < 200 || res.status >= 300) {
      throw espFailure("esp-ingest-complete", res, "Getty ESP ingestion complete failed", secrets);
    }
  }

  return {
    serverCertSha256,
    isAlive: () => !closed,
    async noop() {
      const res = await jsonRequest(conn, auth, "GET", `${basePath}?limit=5`, null);
      if (res.status < 200 || res.status >= 300) {
        throw espFailure("esp-batch-list", res, "Getty ESP submission batch check failed", secrets);
      }
    },
    async uploadFile(fileName, buffer, onAbortHook, meta) {
      const safeName = assertSafeFileName(fileName);
      const batchId = await ensureBatch();
      const raster = isRasterFile(safeName);
      const stem = safeName.replace(/\.[^.]+$/, "").toLowerCase();
      // Only the EPS(vector)+JPG(raster) illustration pair shares one
      // contribution; any other format always gets its own, so a stray SVG/ZIP
      // task can never complete a second time over the pair's file slot.
      const pairable = raster || /\.(eps|ai)$/i.test(safeName);
      let contributionId = pairable ? contributionsByStem.get(stem) : undefined;
      if (!contributionId) {
        contributionId = await initiateContribution(batchId, safeName, raster, meta?.espPair ?? null);
        if (pairable) contributionsByStem.set(stem, contributionId);
      }
      const etags = await uploadChunks(contributionId, buffer, raster, onAbortHook);
      await completeUpload(contributionId, etags, raster, onAbortHook);
      return { batchId, contributionId };
    },
    async quit() { closed = true; },
    destroy() { closed = true; },
  };
}
