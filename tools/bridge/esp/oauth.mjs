// oauth.mjs — Official Getty Images OAuth 2.0 Authorization Code + PKCE (S256)
// and refresh-token session store (`https://authentication.gettyimages.com`).
// Privacy (RULE 20): tokens & verifiers live exclusively in loopback memory (never logged, never written to disk).

import crypto from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { espHttpsRequest } from "./http.mjs";

const GETTY_AUTH_HOST = "authentication.gettyimages.com";
const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 32;

const pendingFlows = new Map();
const tokenStore = new Map();

export function resolveEspAuthConn(conn) {
  const lower = String(conn.host ?? "").toLowerCase();
  if (lower === "api.gettyimages.com" || lower.endsWith(".gettyimages.com")) {
    return {
      host: GETTY_AUTH_HOST,
      port: 443,
      tlsPolicy: conn.tlsPolicy === "accept-self-signed" ? "accept-self-signed" : "strict",
      pinnedCertSha256: "",
      timeoutMs: conn.timeoutMs ?? 30000,
    };
  }
  return conn;
}

function prunePending() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [st, item] of pendingFlows.entries()) {
    if (item.createdAt < cutoff) pendingFlows.delete(st);
  }
  while (pendingFlows.size >= MAX_PENDING) {
    const oldest = pendingFlows.keys().next().value;
    if (!oldest) break;
    pendingFlows.delete(oldest);
  }
}

function parseJson(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

async function postTokenForm(authConn, params) {
  const payload = Buffer.from(params.toString(), "utf8");
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
  return { status: res.status, json: parseJson(res.body), raw: res.body };
}

function storeTokenResponse(apiKey, json) {
  if (typeof json?.access_token !== "string") return null;
  const ttlSec = Number(json.expires_in) > 120 ? Number(json.expires_in) - 60 : 1500;
  const prev = tokenStore.get(apiKey);
  const record = {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : (prev?.refreshToken ?? null),
    expiresAt: Date.now() + ttlSec * 1000,
  };
  tokenStore.set(apiKey, record);
  return record.accessToken;
}

export async function getCachedOrRefreshedEspToken(authConn, apiKey, apiSecret) {
  const hit = tokenStore.get(apiKey);
  if (!hit) return null;
  if (Date.now() < hit.expiresAt && hit.accessToken) return hit.accessToken;
  if (!hit.refreshToken) { tokenStore.delete(apiKey); return null; }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: apiKey,
    refresh_token: hit.refreshToken,
  });
  if (apiSecret) params.set("client_secret", apiSecret);
  const res = await postTokenForm(authConn, params);
  if (res.status >= 200 && res.status < 300) {
    return storeTokenResponse(apiKey, res.json);
  }
  tokenStore.delete(apiKey);
  return null;
}

export function beginEspPkceFlow(cfg, bridgeOrigin) {
  const apiKey = typeof cfg?.apiKey === "string" ? cfg.apiKey.trim() : "";
  const apiSecret = typeof cfg?.apiSecret === "string" ? cfg.apiSecret : "";
  if (apiKey === "") return { ok: false, reason: "Enter and save your Getty API Key first before starting OAuth2 sign-in." };

  prunePending();
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
  const redirectUri = `${bridgeOrigin}/esp/oauth/callback`;
  const authConn = resolveEspAuthConn({
    host: cfg?.host || "api.gettyimages.com",
    port: Number(cfg?.port || 443),
    tlsPolicy: cfg?.tlsPolicy || "strict",
    pinnedCertSha256: cfg?.pinnedCertSha256 || "",
    timeoutMs: Number(cfg?.timeoutMs || 30000),
  });
  pendingFlows.set(state, {
    apiKey, apiSecret, codeVerifier, redirectUri, authConn, createdAt: Date.now(), authorized: false, error: null,
  });

  const portSuffix = authConn.port === 443 ? "" : `:${authConn.port}`;
  const authUrl = new URL(`https://${authConn.host}${portSuffix}/oauth2/auth`);
  authUrl.searchParams.set("client_id", apiKey);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  return { ok: true, state, authorizeUrl: authUrl.toString() };
}

async function exchangeAuthCode(flow, code) {
  const base = {
    grant_type: "authorization_code",
    code,
    redirect_uri: flow.redirectUri,
    client_id: flow.apiKey,
    code_verifier: flow.codeVerifier,
  };
  if (flow.apiSecret !== "") {
    const withSecret = new URLSearchParams({ ...base, client_secret: flow.apiSecret });
    const first = await postTokenForm(flow.authConn, withSecret);
    if (first.status >= 200 && first.status < 300 && typeof first.json?.access_token === "string") return first;
  }
  return postTokenForm(flow.authConn, new URLSearchParams(base));
}

function htmlReply(res, status, title, bodyText) {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:32px"><h2>${title}</h2><p>${bodyText}</p></body>`;
  const buf = Buffer.from(html, "utf8");
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "content-length": buf.length, "cache-control": "no-store" });
  res.end(buf);
  return buf.length;
}

export async function handleEspOAuthStart(req, res, port, jsonReply) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return jsonReply(res, 400, { ok: false, reason: "invalid JSON body" });
  }
  const started = beginEspPkceFlow(body, `http://127.0.0.1:${port}`);
  return jsonReply(res, started.ok ? 200 : 400, started);
}

export async function handleEspOAuthCallback(req, res, port) {
  const u = new URL(req.url ?? "/esp/oauth/callback", `http://127.0.0.1:${port}`);
  const state = u.searchParams.get("state") ?? "";
  const code = u.searchParams.get("code") ?? "";
  const flow = pendingFlows.get(state);
  if (!flow || !code) {
    return htmlReply(res, 400, "Getty OAuth2 authorization failed", "Invalid or expired OAuth2 state. Return to IconSplitter and try again.");
  }
  try {
    const exchanged = await exchangeAuthCode(flow, code);
    const token = storeTokenResponse(flow.apiKey, exchanged.json);
    if (!token) {
      flow.error = "Getty token exchange rejected authorization code";
      return htmlReply(res, 401, "Getty OAuth2 token exchange failed", "Verify your Getty API Key / Secret and try again.");
    }
    flow.authorized = true;
    return htmlReply(res, 200, "Getty Images OAuth2 connected", "Authorization succeeded. You can close this tab and return to IconSplitter.");
  } catch {
    flow.error = "Network failure contacting authentication.gettyimages.com";
    return htmlReply(res, 502, "Getty OAuth2 network error", "Could not reach Getty authorization server.");
  }
}

export function handleEspOAuthStatus(req, res, port, jsonReply) {
  const u = new URL(req.url ?? "/esp/oauth/status", `http://127.0.0.1:${port}`);
  const state = u.searchParams.get("state") ?? "";
  const flow = pendingFlows.get(state);
  if (!flow) return jsonReply(res, 404, { ok: false, authorized: false, error: "expired" });
  return jsonReply(res, 200, { ok: true, authorized: Boolean(flow.authorized), error: flow.error });
}
