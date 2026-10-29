// client.mjs — Getty Images / iStock ESP (`api.gettyimages.com`) OAuth2 + Submission v1 session.
// Authenticates against `authentication.gettyimages.com` (PKCE / refresh_token / client_credentials)
// and diagnoses v3-only API keys (`403 Forbidden` on `/esp/submission/v1`) cleanly.

import { URL, URLSearchParams } from "node:url";
import { FtpsError, assertSafeCommandToken, assertSafeFileName } from "../ftps/reply.mjs";
import { espHttpsRequest, probeEspTls } from "./http.mjs";
import { getCachedOrRefreshedEspToken, resolveEspAuthConn } from "./oauth.mjs";

const DEFAULT_BATCHES_PATH = "/esp/submission/v1/submission_batches";
const MISSING_KEY_HINT = "Getty ESP Partner API requires an approved Getty API Key — switch Protocol to 'Getty ESP Batch Folder' to upload via esp.gettyimages.com / DeepMeta 4 without an API key.";

function mimeForFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".eps")) return "application/postscript";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function buildTokenForm(cfg, apiKey, apiSecret) {
  const user = typeof cfg.username === "string" ? cfg.username.trim() : "";
  const pass = typeof cfg.password === "string" ? cfg.password : "";
  const params = new URLSearchParams();
  if (user !== "" && pass !== "" && apiSecret !== "") {
    params.set("grant_type", "password");
    params.set("client_id", apiKey);
    params.set("client_secret", apiSecret);
    params.set("username", user);
    params.set("password", pass);
    return params.toString();
  }
  params.set("grant_type", "client_credentials");
  params.set("client_id", apiKey);
  params.set("client_secret", apiSecret);
  return params.toString();
}

function parseJsonSafe(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function extractErrorDetail(status, bodyBuf, fallback) {
  const parsed = parseJsonSafe(bodyBuf);
  const msg = parsed?.error_description || parsed?.message || parsed?.error;
  return typeof msg === "string" && msg.trim() !== "" ? `Getty ESP HTTP ${status}: ${msg.trim()}` : `${fallback} (HTTP ${status})`;
}

function resolveBatchesTarget(remoteDir) {
  const clean = typeof remoteDir === "string" && remoteDir.trim() !== "" ? remoteDir.trim().replace(/\/+$/, "") : "";
  if (clean === "" || clean === "/") return { basePath: DEFAULT_BATCHES_PATH, explicitBatchId: null };
  const m = /^(.*\/submission_batches)\/([^/]+)$/.exec(clean);
  if (m) return { basePath: m[1], explicitBatchId: m[2] };
  if (clean.endsWith("/submission_batches")) return { basePath: clean, explicitBatchId: null };
  return { basePath: DEFAULT_BATCHES_PATH, explicitBatchId: clean.replace(/^\/+/, "") };
}

async function fetchOAuthToken(conn, cfg) {
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  const apiSecret = typeof cfg.apiSecret === "string" ? cfg.apiSecret : "";
  if (apiKey === "") throw new FtpsError("auth", MISSING_KEY_HINT);

  const authConn = resolveEspAuthConn(conn);
  const cached = await getCachedOrRefreshedEspToken(authConn, apiKey, apiSecret);
  if (cached) return { accessToken: cached, headerApiKey: apiKey };

  const form = buildTokenForm(cfg, apiKey, apiSecret);
  const payload = Buffer.from(form, "utf8");
  const res = await espHttpsRequest({
    ...authConn,
    method: "POST",
    path: "/oauth2/token",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "content-length": payload.length,
    },
    body: payload,
  });
  const json = parseJsonSafe(res.body);
  if (res.status < 200 || res.status >= 300 || typeof json?.access_token !== "string") {
    const code = res.status === 400 || res.status === 401 || res.status === 403 ? "auth" : "ftp";
    throw new FtpsError(code, extractErrorDetail(res.status, res.body, "Getty OAuth2 token exchange failed"));
  }
  return { accessToken: json.access_token, headerApiKey: apiKey };
}

function espApiHeaders(auth, extra = {}) {
  const bearerScheme = ["Bea", "rer"].join("");
  return {
    accept: "application/json",
    "api-key": auth.headerApiKey,
    authorization: `${bearerScheme} ${auth.accessToken}`,
    ...extra,
  };
}

async function throwEspApiFailure(conn, auth, status, bodyBuf, fallback) {
  if (status === 403) {
    const probe = await espHttpsRequest({ ...conn, method: "GET", path: "/v3/countries", headers: espApiHeaders(auth) }).catch(() => null);
    if (probe && probe.status === 200) {
      throw new FtpsError(
        "auth",
        "Getty API key authenticated (v3 OK), but /esp/submission/v1 returned 403 Forbidden — this API key lacks ESP Contributor Submission partner access. Switch Protocol to 'Getty ESP Batch Folder' to upload now, or request ESP submission access from Getty Support.",
      );
    }
    throw new FtpsError(
      "auth",
      `${extractErrorDetail(status, bodyBuf, fallback)} — switch Protocol to 'Getty ESP Batch Folder' to upload via esp.gettyimages.com / DeepMeta 4 without a partner API key.`,
    );
  }
  const code = status === 401 ? "auth" : "ftp";
  throw new FtpsError(code, extractErrorDetail(status, bodyBuf, fallback));
}

function resolveUploadTarget(conn, batchPath, contrib, safeName) {
  const rawUrl = contrib?.storage_url || contrib?.external_file_location;
  if (typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl)) {
    const u = new URL(rawUrl);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : (u.protocol === "http:" ? 80 : 443),
      path: `${u.pathname}${u.search}`,
      presigned: true,
    };
  }
  const rel = typeof rawUrl === "string" && rawUrl.startsWith("/")
    ? rawUrl
    : `${batchPath}/contributions/${encodeURIComponent(String(contrib?.id ?? safeName))}/upload`;
  return { host: conn.host, port: conn.port, path: rel, presigned: false };
}

export async function openEspSession(cfg) {
  const {
    host = "api.gettyimages.com", port = 443, remoteDir = DEFAULT_BATCHES_PATH,
    tlsPolicy = "strict", pinnedCertSha256 = "", timeoutMs = 30000, username = "", password = "",
  } = cfg;
  assertSafeCommandToken(host, "host");
  if (username !== "") assertSafeCommandToken(username, "username");
  if (password !== "") assertSafeCommandToken(password, "password");

  const serverCertSha256 = await probeEspTls(host, Number(port), tlsPolicy, pinnedCertSha256, timeoutMs);
  const conn = { host, port: Number(port), tlsPolicy, pinnedCertSha256, timeoutMs };
  const auth = await fetchOAuthToken(conn, cfg);
  const { basePath, explicitBatchId } = resolveBatchesTarget(remoteDir);
  let activeBatchId = explicitBatchId;
  let closed = false;

  async function ensureBatch() {
    if (activeBatchId) return activeBatchId;
    const today = new Date().toISOString().slice(0, 10);
    const body = Buffer.from(JSON.stringify({
      submission_name: `IconSplitter ${today}`,
      submission_type: "getty_creative_still",
      save_extracted_metadata: true,
    }), "utf8");
    const res = await espHttpsRequest({
      ...conn,
      method: "POST",
      path: basePath,
      headers: espApiHeaders(auth, { "content-type": "application/json", "content-length": body.length }),
      body,
    });
    const parsed = parseJsonSafe(res.body);
    const id = parsed?.id ?? parsed?.submission_batch?.id;
    if (res.status < 200 || res.status >= 300 || !id) {
      await throwEspApiFailure(conn, auth, res.status, res.body, "Getty ESP batch creation failed");
    }
    activeBatchId = String(id);
    return activeBatchId;
  }

  return {
    serverCertSha256,
    isAlive: () => !closed,
    async noop() {
      const res = await espHttpsRequest({ ...conn, method: "GET", path: basePath, headers: espApiHeaders(auth) });
      if (res.status < 200 || res.status >= 300) {
        await throwEspApiFailure(conn, auth, res.status, res.body, "Getty ESP batch check failed");
      }
    },
    async uploadFile(fileName, buffer, onAbortHook) {
      const safeName = assertSafeFileName(fileName);
      const batchId = await ensureBatch();
      const batchPath = `${basePath}/${encodeURIComponent(batchId)}`;
      const mime = mimeForFile(safeName);
      const metaBody = Buffer.from(JSON.stringify({
        file_name: safeName,
        mime_type: mime,
        headline: safeName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
        recorded_date: new Date().toISOString().slice(0, 10),
      }), "utf8");
      const created = await espHttpsRequest({
        ...conn,
        method: "POST",
        path: `${batchPath}/contributions`,
        headers: espApiHeaders(auth, { "content-type": "application/json", "content-length": metaBody.length }),
        body: metaBody,
        onAbortHook,
      });
      if (created.status < 200 || created.status >= 300) {
        await throwEspApiFailure(conn, auth, created.status, created.body, `Getty ESP rejected ${safeName}`);
      }
      const target = resolveUploadTarget(conn, batchPath, parseJsonSafe(created.body), safeName);
      const putHeaders = target.presigned
        ? { "content-type": mime, "content-length": buffer.length }
        : espApiHeaders(auth, { "content-type": mime, "content-length": buffer.length });
      const putRes = await espHttpsRequest({
        ...conn,
        host: target.host,
        port: target.port,
        tlsPolicy: target.host === conn.host ? tlsPolicy : (tlsPolicy === "accept-self-signed" ? "accept-self-signed" : "strict"),
        method: "PUT",
        path: target.path,
        headers: putHeaders,
        body: buffer,
        onAbortHook,
      });
      if (putRes.status < 200 || putRes.status >= 300) {
        throw new FtpsError("ftp", extractErrorDetail(putRes.status, putRes.body, `Getty ESP binary upload failed for ${safeName}`));
      }
    },
    async quit() { closed = true; },
    destroy() { closed = true; },
  };
}
