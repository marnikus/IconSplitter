// http.mjs — zero-dependency Node TLS/HTTPS transport for Getty ESP (`api.gettyimages.com:443`).
// Verifies server X.509 certificate policy BEFORE sending OAuth2 or ESP credentials.

import crypto from "node:crypto";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { FtpsError, describeSocketError } from "../ftps/reply.mjs";

export function certSha256Of(tlsSocket) {
  const peer = tlsSocket.getPeerCertificate(true);
  if (!peer || !peer.raw) return null;
  return crypto.createHash("sha256").update(peer.raw).digest("hex").toLowerCase();
}

export function verifyEspPeerCert(tlsSocket, tlsPolicy, pinnedCertSha256) {
  const sha = certSha256Of(tlsSocket);
  if (tlsPolicy === "accept-self-signed") return sha;
  if (tlsPolicy === "pinned") {
    const expected = String(pinnedCertSha256 ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
    if (!sha || expected === "" || sha !== expected) {
      throw new FtpsError("cert", "Getty ESP TLS certificate fingerprint did not match pinned SHA-256", sha);
    }
    return sha;
  }
  if (!tlsSocket.authorized) {
    const detail = tlsSocket.authorizationError || "untrusted certificate";
    throw new FtpsError("cert", `Getty ESP TLS certificate warning (${detail})`, sha);
  }
  return sha;
}

export function probeEspTls(host, port, tlsPolicy, pinnedCertSha256, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({
      host,
      port: Number(port),
      servername: net.isIP(host) === 0 ? host : undefined,
      rejectUnauthorized: false,
    });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new FtpsError("timeout", `Getty ESP TLS handshake to ${host}:${port} timed out`));
    }, timeoutMs);
    sock.once("secureConnect", () => {
      clearTimeout(timer);
      try {
        const sha = verifyEspPeerCert(sock, tlsPolicy, pinnedCertSha256);
        sock.end();
        resolve(sha);
      } catch (err) {
        sock.destroy();
        reject(err);
      }
    });
    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(new FtpsError("network", `Getty ESP connect to ${host}:${port} failed: ${describeSocketError(err)}`));
    });
  });
}

function attachTlsPinGuard(req, tlsPolicy, pinnedCertSha256, onCertErr) {
  req.once("socket", (sock) => {
    sock.once("secureConnect", () => {
      try {
        verifyEspPeerCert(sock, tlsPolicy, pinnedCertSha256);
      } catch (err) {
        onCertErr(err);
        req.destroy(err);
      }
    });
  });
}

export function espHttpsRequest(opts) {
  const {
    host, port, method, path, headers, body,
    tlsPolicy = "strict", pinnedCertSha256 = "", timeoutMs = 30000, onAbortHook,
  } = opts;
  return new Promise((resolve, reject) => {
    let certErr = null;
    const req = https.request(
      { host, port: Number(port), method, path, headers, rejectUnauthorized: false, agent: false },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }); });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new FtpsError("timeout", `Getty ESP HTTP ${method} timed out`));
    }, timeoutMs);
    attachTlsPinGuard(req, tlsPolicy, pinnedCertSha256, (e) => { certErr = e; });
    onAbortHook?.(() => req.destroy(new FtpsError("network", "Getty ESP upload aborted")));
    req.once("error", (err) => {
      clearTimeout(timer);
      if (certErr) { reject(certErr); return; }
      reject(err instanceof FtpsError ? err : new FtpsError("network", describeSocketError(err, "Getty ESP request failed")));
    });
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}
