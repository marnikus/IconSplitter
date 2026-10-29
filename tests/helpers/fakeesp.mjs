// fakeesp.mjs — local self-signed HTTPS Getty OAuth2 (PKCE + client_credentials + password)
// & ESP Submission v1 + API v3 server for hermetic TDD. No .pem/.key files on disk.

import crypto from "node:crypto";
import https from "node:https";
import { URL, URLSearchParams } from "node:url";

function derLen(len) {
  if (len < 128) return Buffer.from([len]);
  const hex = len.toString(16).padStart(len > 255 ? 4 : 2, "0");
  const bytes = Buffer.from(hex, "hex");
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
}

function derTlv(tag, body) {
  return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
}

function derSeq(...items) { return derTlv(0x30, Buffer.concat(items)); }
function derSet(...items) { return derTlv(0x31, Buffer.concat(items)); }
function derOid(bytes) { return derTlv(0x06, Buffer.from(bytes)); }
function derUtf8(str) { return derTlv(0x0c, Buffer.from(str, "utf8")); }
function derUtcTime(d) {
  const s = d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z";
  return derTlv(0x17, Buffer.from(s, "ascii"));
}
function derInt(buf) {
  const b = (buf[0] & 0x80) !== 0 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
  return derTlv(0x02, b);
}

function generateSelfSignedTls() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const algEcdsaSha256 = derSeq(derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
  const cn = derSeq(derSet(derSeq(derOid([0x55, 0x04, 0x03]), derUtf8("127.0.0.1"))));
  const validity = derSeq(derUtcTime(new Date(Date.now() - 60_000)), derUtcTime(new Date(Date.now() + 86_400_000)));
  const tbs = derSeq(
    derTlv(0xa0, derInt(Buffer.from([0x02]))),
    derInt(crypto.randomBytes(8)),
    algEcdsaSha256,
    cn,
    validity,
    cn,
    spki,
  );
  const sig = crypto.sign("sha256", tbs, privateKey);
  const sigBitString = derTlv(0x03, Buffer.concat([Buffer.from([0x00]), sig]));
  const certDer = derSeq(tbs, algEcdsaSha256, sigBitString);
  const certPem = `-----BEGIN CERTIFICATE-----\n${certDer.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
  const keyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const certSha256 = crypto.createHash("sha256").update(certDer).digest("hex");
  return { certPem, keyPem, certSha256 };
}

function readReqBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const raw = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(raw) });
  res.end(raw);
}

function s256Challenge(verifier) {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export async function startFakeEspServer(expected) {
  const tlsMat = generateSelfSignedTls();
  const issuedToken = `t_${crypto.randomBytes(3).toString("hex")}`;
  const issuedRefresh = `r_${crypto.randomBytes(3).toString("hex")}`;
  const authCodes = new Map();
  const state = {
    tokenRequests: 0,
    batchCreations: 0,
    userAgents: [],
    batches: [],
    contributions: [],
    uploadedFiles: new Map(),
  };

  function checkBearer(req, res) {
    const auth = req.headers.authorization ?? "";
    const apiKey = req.headers["api-key"] ?? "";
    if (auth !== `Bearer ${issuedToken}` || apiKey !== expected.apiKey) {
      sendJson(res, 401, { message: "Invalid access token or Api-Key" });
      return false;
    }
    return true;
  }

  const server = https.createServer({ key: tlsMat.keyPem, cert: tlsMat.certPem }, async (req, res) => {
    const port = server.address().port;
    const fullUrl = new URL(req.url ?? "/", `https://127.0.0.1:${port}`);
    const url = fullUrl.pathname;
    state.userAgents.push(String(req.headers["user-agent"] ?? ""));
    const body = await readReqBody(req);

    if (expected.requireUserAgent && !req.headers["user-agent"]) {
      return sendJson(res, 403, { message: "Forbidden" });
    }

    if (req.method === "GET" && url === "/oauth2/auth") {
      const clientId = fullUrl.searchParams.get("client_id");
      const redirectUri = fullUrl.searchParams.get("redirect_uri") ?? "";
      const st = fullUrl.searchParams.get("state") ?? "";
      const challenge = fullUrl.searchParams.get("code_challenge") ?? "";
      const method = fullUrl.searchParams.get("code_challenge_method") ?? "S256";
      if (clientId !== expected.apiKey || !challenge || method !== "S256") {
        return sendJson(res, 400, { error: "invalid_request" });
      }
      const code = `c_${crypto.randomBytes(4).toString("hex")}`;
      authCodes.set(code, { challenge, redirectUri });
      const redir = new URL(redirectUri);
      redir.searchParams.set("code", code);
      redir.searchParams.set("state", st);
      res.writeHead(302, { location: redir.toString() });
      res.end();
      return;
    }

    if (req.method === "POST" && url === "/oauth2/token") {
      state.tokenRequests += 1;
      const form = new URLSearchParams(body.toString("utf8"));
      const grant = form.get("grant_type");
      const okAuthCode = (() => {
        if (grant !== "authorization_code") return false;
        const entry = authCodes.get(form.get("code") ?? "");
        if (!entry || form.get("client_id") !== expected.apiKey) return false;
        if (expected.publicClient && form.has("client_secret")) return false;
        if (!expected.publicClient && expected.apiSecret && form.get("client_secret") !== expected.apiSecret) return false;
        return s256Challenge(form.get("code_verifier") ?? "") === entry.challenge;
      })();
      const okRefresh = grant === "refresh_token"
        && form.get("client_id") === expected.apiKey
        && form.get("refresh_token") === issuedRefresh;
      const okPass = grant === "password"
        && form.get("client_id") === expected.apiKey
        && form.get("client_secret") === expected.apiSecret
        && form.get("username") === expected.username
        && form.get("password") === expected.password;
      const okClient = grant === "client_credentials"
        && Boolean(expected.apiKey)
        && form.get("client_id") === expected.apiKey
        && form.get("client_secret") === expected.apiSecret;
      if (!okAuthCode && !okRefresh && !okPass && !okClient) {
        return sendJson(res, 401, {
          error: "invalid_grant",
          error_description: `Auth rejected for ${form.get("username") ?? ""} ${form.get("password") ?? ""} ${form.get("client_id") ?? ""} ${form.get("client_secret") ?? ""}`,
        });
      }
      return sendJson(res, 200, {
        access_token: issuedToken, token_type: "Bearer", expires_in: 1800, refresh_token: issuedRefresh,
      });
    }

    if (req.method === "GET" && url === "/v3/countries") {
      if (!checkBearer(req, res)) return;
      return sendJson(res, 200, { countries: [{ iso_alpha_2: "CZ", name: "Czechia" }] });
    }

    if (req.method === "GET" && url === "/esp/submission/v1/submission_batches") {
      if (!checkBearer(req, res)) return;
      if (expected.espForbidden) return sendJson(res, 403, { message: "Forbidden" });
      return sendJson(res, 200, { items: state.batches, meta: { total_items: state.batches.length } });
    }

    if (req.method === "POST" && url === "/esp/submission/v1/submission_batches") {
      if (!checkBearer(req, res)) return;
      if (expected.espForbidden) return sendJson(res, 403, { message: "Forbidden" });
      state.batchCreations += 1;
      const parsed = JSON.parse(body.toString("utf8"));
      const batch = {
        id: `batch-${900 + state.batchCreations}`,
        submission_name: parsed.submission_name ?? "Batch",
        submission_type: parsed.submission_type ?? "getty_creative_still",
      };
      state.batches.push(batch);
      return sendJson(res, 201, batch);
    }

    const contribMatch = /^\/esp\/submission\/v1\/submission_batches\/([^/]+)\/contributions$/.exec(url);
    if (req.method === "POST" && contribMatch) {
      if (!checkBearer(req, res)) return;
      const batchId = contribMatch[1];
      const payload = JSON.parse(body.toString("utf8"));
      const item = payload.contribution ?? payload;
      const id = `c-${state.contributions.length + 1}`;
      const record = {
        id,
        submission_batch_id: batchId,
        file_name: item.file_name,
        mime_type: item.mime_type,
        storage_url: `https://127.0.0.1:${port}/s3-upload/${batchId}/${encodeURIComponent(item.file_name)}`,
      };
      state.contributions.push(record);
      return sendJson(res, 201, record);
    }

    const s3Match = /^\/s3-upload\/([^/]+)\/(.+)$/.exec(url);
    if (req.method === "PUT" && s3Match) {
      const batchId = s3Match[1];
      const fileName = decodeURIComponent(s3Match[2]);
      state.uploadedFiles.set(`${batchId}/${fileName}`, Buffer.from(body));
      res.writeHead(200);
      res.end();
      return;
    }

    sendJson(res, 404, { message: `Unknown route ${req.method} ${url}` });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    certSha256: tlsMat.certSha256,
    state,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
