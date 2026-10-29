// fakeesp.mjs — local self-signed HTTPS stand-in for the REAL Getty ESP API surface:
// OAuth2 `password` grant at /oauth2/token (all 4 credentials), ESP calls with
// `Authorization: Token token=<access_token>` + `Api-Key` (Bearer is rejected),
// Submission v1 batches, and Ingestion v1 chunked S3 multipart uploads
// (initiate -> authorize_chunk (sha256) -> PUT chunk -> ETag -> complete).
// `expected.failStage` injects one staged ESP failure for error-reporting tests.
// Generates its own ephemeral TLS certificate via pure DER/ASN.1 + node:crypto (no .pem/.key files!).

import crypto from "node:crypto";
import https from "node:https";
import { URLSearchParams } from "node:url";

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

/** Builds a valid self-signed X.509 v3 ECDSA-P256 certificate + PKCS#8 PEM in memory. */
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

export async function startFakeEspServer(expected) {
  const tlsMat = generateSelfSignedTls();
  const issuedToken = `t_${crypto.randomBytes(3).toString("hex")}`;
  const failStage = expected.failStage ?? null;
  const state = {
    tokenRequests: 0,
    tokenGrants: [],
    authHeaders: [],
    batchCreations: 0,
    batches: [],
    contributions: [],
    ingestInitiations: [],
    authorizeRequests: [],
    completions: [],
    uploadedFiles: new Map(),
  };
  const chunksByKey = new Map(); // `${contributionId}/${slot}` -> Map<partNumber, {body, etag, sha}>

  function checkEspAuth(req, res) {
    const auth = req.headers.authorization ?? "";
    const apiKey = req.headers["api-key"] ?? "";
    state.authHeaders.push(auth);
    if (auth !== `Token token=${issuedToken}` || apiKey !== expected.apiKey) {
      res.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": 'Token realm="ESP", error="invalid_token"',
      });
      res.end(JSON.stringify({ message: "Invalid authentication token" }));
      return false;
    }
    return true;
  }

  function handleToken(req, res, body) {
    state.tokenRequests += 1;
    const form = new URLSearchParams(body.toString("utf8"));
    const grant = form.get("grant_type");
    state.tokenGrants.push(grant ?? "");
    if (grant !== "password") {
      return sendJson(res, 400, {
        error: "unsupported_grant_type",
        error_description: "The authorization grant type is not supported for ESP contributor login",
      });
    }
    const ok = form.get("client_id") === expected.apiKey
      && form.get("client_secret") === expected.apiSecret
      && form.get("username") === expected.username
      && form.get("password") === expected.password;
    if (!ok) {
      return sendJson(res, 401, {
        error: "invalid_grant",
        error_description: `Auth rejected for ${form.get("username") ?? ""} ${form.get("password") ?? ""} ${form.get("client_id") ?? ""} ${form.get("client_secret") ?? ""}`,
      });
    }
    return sendJson(res, 200, { access_token: issuedToken, token_type: "Bearer", expires_in: 1800 });
  }

  function handleIngestInitiate(res, body) {
    if (failStage === "ingest-422") {
      return sendJson(res, 422, { errors: { file_name: ["is not valid for this submission batch type"], upload_bucket: ["is not a known ESP upload bucket"] } });
    }
    const parsed = JSON.parse(body.toString("utf8"));
    const item = parsed.contribution ?? parsed;
    const batch = state.batches.find((b) => b.id === String(item.submission_batch_id));
    if (!batch) return sendJson(res, 404, { message: "Submission batch not found" });
    if (!item.upload_bucket) return sendJson(res, 422, { errors: { upload_bucket: ["can't be blank"] } });
    if (!item.file_name && !item.raster_file_name) return sendJson(res, 422, { errors: { file_name: ["can't be blank"] } });
    const record = {
      id: `c-${state.contributions.length + 1}`,
      submission_batch_id: batch.id,
      file_name: item.file_name ?? "",
      mime_type: item.mime_type ?? "",
      raster_file_name: item.raster_file_name ?? "",
      raster_mime_type: item.raster_mime_type ?? "",
      upload_bucket: item.upload_bucket,
    };
    state.contributions.push(record);
    state.ingestInitiations.push({ ...record });
    return sendJson(res, 201, { contribution_id: record.id });
  }

  function handleAuthorizeChunk(reqUrl, res, contributionId, port) {
    const q = new URLSearchParams(reqUrl.search);
    const partNumber = Number(q.get("part_number") ?? "0");
    const raster = q.get("raster_file") === "true";
    const sha = q.get("encrypted_payload") ?? "";
    if (q.get("id") !== contributionId || partNumber < 1 || !/^[0-9a-f]{64}$/.test(sha)) {
      return sendJson(res, 422, { errors: { encrypted_payload: ["must be the SHA-256 hex digest of the chunk"] } });
    }
    state.authorizeRequests.push({ contributionId, partNumber, rasterFile: raster, encryptedPayload: sha });
    const slot = raster ? "raster" : "file";
    const key = `${contributionId}/${slot}`;
    if (!chunksByKey.has(key)) chunksByKey.set(key, new Map());
    chunksByKey.get(key).set(partNumber, { body: null, etag: `"etag-${contributionId}-${slot}-${partNumber}"`, sha });
    return sendJson(res, 200, {
      upload_url: `https://127.0.0.1:${port}/s3-upload/${contributionId}/${slot}/${partNumber}?sig=fake`,
      headers: { "x-fake-s3-auth": `sig-part-${partNumber}`, "content-type": "application/octet-stream" },
    });
  }

  function handleS3Put(req, res, body, m) {
    const [, contributionId, slot, partRaw] = m;
    const partNumber = Number(partRaw);
    if (req.headers["x-fake-s3-auth"] !== `sig-part-${partNumber}`) {
      res.writeHead(403, { "content-type": "application/xml" });
      res.end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
      return;
    }
    const entry = chunksByKey.get(`${contributionId}/${slot}`)?.get(partNumber);
    if (!entry) return sendJson(res, 404, { message: "chunk was not authorized" });
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    if (sha !== entry.sha) return sendJson(res, 400, { message: "chunk SHA-256 does not match encrypted_payload" });
    entry.body = Buffer.from(body);
    res.writeHead(200, { etag: entry.etag });
    res.end();
  }

  function handleIngestComplete(res, body, contributionId) {
    const parsed = JSON.parse(body.toString("utf8"));
    const record = state.contributions.find((c) => c.id === contributionId);
    if (!record) return sendJson(res, 404, { message: "Contribution not found" });
    const raster = parsed.raster_file === true;
    const slot = raster ? "raster" : "file";
    const parts = chunksByKey.get(`${contributionId}/${slot}`) ?? new Map();
    const etags = Array.isArray(parsed.etags) ? parsed.etags : [];
    const ordered = etags.map((e) => parts.get(Number(e.part_number)));
    if (ordered.length === 0 || ordered.some((p, i) => !p?.body || etags[i].etag !== p.etag)) {
      return sendJson(res, 422, { errors: { etags: ["do not match the authorized upload parts"] } });
    }
    const fileName = raster ? record.raster_file_name : record.file_name;
    state.uploadedFiles.set(`${record.submission_batch_id}/${fileName}`, Buffer.concat(ordered.map((p) => p.body)));
    state.completions.push({ contributionId, rasterFile: raster, etags });
    return sendJson(res, 200, { id: contributionId, file_uploaded: true });
  }

  const server = https.createServer({ key: tlsMat.keyPem, cert: tlsMat.certPem }, async (req, res) => {
    const port = server.address().port;
    const reqUrl = new URL(req.url ?? "/", `https://127.0.0.1:${port}`);
    const url = reqUrl.pathname;
    const body = await readReqBody(req);

    if (req.method === "POST" && url === "/oauth2/token") return handleToken(req, res, body);

    const s3Match = /^\/s3-upload\/([^/]+)\/(file|raster)\/(\d+)$/.exec(url);
    if (req.method === "PUT" && s3Match) return handleS3Put(req, res, body, s3Match);

    if (url.startsWith("/esp/") && !checkEspAuth(req, res)) return;

    if (req.method === "GET" && url === "/esp/submission/v1/submission_batches") {
      if (failStage === "batch-list-403") {
        return sendJson(res, 403, { message: "ESP submission access is not enabled for this API key" });
      }
      return sendJson(res, 200, { items: state.batches, meta: { total_items: state.batches.length } });
    }

    if (req.method === "POST" && url === "/esp/submission/v1/submission_batches") {
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

    if (req.method === "POST" && url === "/esp/ingestion/v1/contributions") return handleIngestInitiate(res, body);

    const authMatch = /^\/esp\/ingestion\/v1\/contributions\/([^/]+)\/authorize_chunk$/.exec(url);
    if (req.method === "GET" && authMatch) return handleAuthorizeChunk(reqUrl, res, authMatch[1], port);

    const completeMatch = /^\/esp\/ingestion\/v1\/contributions\/([^/]+)$/.exec(url);
    if (req.method === "PUT" && completeMatch) return handleIngestComplete(res, body, completeMatch[1]);

    return sendJson(res, 404, { message: `Unknown route ${req.method} ${url}` });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    certSha256: tlsMat.certSha256,
    state,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
