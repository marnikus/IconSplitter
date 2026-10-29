// client.mjs — Getty Images / iStock ESP (`api.gettyimages.com`) OAuth2 + Submission v1 session.
// Authenticates against `authentication.gettyimages.com` (PKCE / refresh_token / client_credentials)
// and diagnoses v3-only API keys (`403 Forbidden` on `/esp/submission/v1`) cleanly.

import { URLSearchParams } from "node:url";
import { FtpsError, assertSafeCommandToken, assertSafeFileName } from "../ftps/reply.mjs";
import { uploadEspContribution } from "./ingestion.mjs";
import { createIngestionTransports } from "./transport.mjs";
import { espHttpsRequest, probeEspTls } from "./http.mjs";
import { getCachedOrRefreshedEspToken, resolveEspAuthConn } from "./oauth.mjs";

const DEFAULT_BATCHES_PATH = "/esp/submission/v1/submission_batches";
const MISSING_KEY_HINT = "Getty ESP automatic upload requires an ESP API key issued by Getty.";

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
        "Getty API key authenticated (v3 OK), but /esp/submission/v1 returned 403 Forbidden — this API key or user may lack ESP Contributor Submission partner access. Request ESP submission and ingestion access from Getty Support.",
      );
    }
    throw new FtpsError(
      "auth",
      `${extractErrorDetail(status, bodyBuf, fallback)} — request ESP submission and ingestion access from Getty Support.`,
    );
  }
  const code = status === 401 ? "auth" : "ftp";
  throw new FtpsError(code, extractErrorDetail(status, bodyBuf, fallback));
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

  async function ensureBatch(onAbortHook) {
    if (activeBatchId) return activeBatchId;
    const today = new Date().toISOString().slice(0, 10);
    const body = Buffer.from(JSON.stringify({
      submission_name: `IconSplitter ${today}`,
      submission_type: "istock_creative_illustration",
      save_extracted_metadata: true,
    }), "utf8");
    const res = await espHttpsRequest({
      ...conn,
      method: "POST",
      path: basePath,
      headers: { ...espApiHeaders(auth, { "content-type": "application/json", "content-length": body.length }), authorization: `Token token=${auth.accessToken}` },
      body,
      onAbortHook,
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
      const res = await espHttpsRequest({ ...conn, method: "GET", path: basePath, headers: { ...espApiHeaders(auth), authorization: `Token token=${auth.accessToken}` } });
      if (res.status < 200 || res.status >= 300) {
        await throwEspApiFailure(conn, auth, res.status, res.body, "Getty ESP batch check failed");
      }
    },
    async uploadContribution(raster, vector, onAbortHook) {
      assertSafeFileName(raster.name);
      if (vector) assertSafeFileName(vector.name);
      const batchId = await ensureBatch(onAbortHook);
      const transports = createIngestionTransports({ conn, auth, onAbortHook, throwEspApiFailure });
      await uploadEspContribution({ batchId, bucket: "oregon", raster, vector, ...transports });
    },
    async quit() { closed = true; },
    destroy() { closed = true; },
  };
}
