// client.mjs — zero-dependency Node net/tls Explicit & Implicit FTPS client.
// Verifies server certificate policy BEFORE transmitting USER/PASS credentials.

import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { negotiatePassivePort } from "./pasv.mjs";
import {
  FtpsError, assertSafeCommandToken, assertSafeFileName, createReplyReader, describeSocketError,
} from "./reply.mjs";

function certSha256Of(tlsSocket) {
  const peer = tlsSocket.getPeerCertificate(true);
  if (!peer || !peer.raw) return null;
  return crypto.createHash("sha256").update(peer.raw).digest("hex").toLowerCase();
}

function verifyPeerCertificate(tlsSocket, tlsPolicy, pinnedCertSha256) {
  const sha = certSha256Of(tlsSocket);
  if (tlsPolicy === "accept-self-signed") return sha;
  if (tlsPolicy === "pinned") {
    const expected = String(pinnedCertSha256 ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
    if (!sha || expected === "" || sha !== expected) {
      throw new FtpsError("cert", "FTPS server certificate fingerprint did not match pinned SHA-256", sha);
    }
    return sha;
  }
  if (!tlsSocket.authorized) {
    const detail = tlsSocket.authorizationError || "untrusted certificate";
    throw new FtpsError("cert", `FTPS server certificate warning (${detail})`, sha);
  }
  return sha;
}

function connectTcp(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new FtpsError("timeout", `TCP connection to ${host}:${port} timed out`));
    }, timeoutMs);
    sock.once("connect", () => { clearTimeout(timer); resolve(sock); });
    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(new FtpsError("network", `FTPS TCP connect to ${host}:${port} failed: ${describeSocketError(err)}`));
    });
  });
}

function upgradeToTls(rawSocket, host, timeoutMs, session) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket: rawSocket,
      servername: net.isIP(host) === 0 ? host : undefined,
      rejectUnauthorized: false,
      ...(session ? { session } : {}),
    });
    const timer = setTimeout(() => {
      secure.destroy();
      reject(new FtpsError("timeout", "TLS handshake timed out"));
    }, timeoutMs);
    secure.once("secureConnect", () => { clearTimeout(timer); resolve(secure); });
    secure.once("error", (err) => { clearTimeout(timer); reject(new FtpsError("cert", describeSocketError(err, "TLS handshake failed"))); });
  });
}

export async function openFtpsSession(cfg) {
  const {
    protocol = "ftps-explicit", host, port = 21, remoteDir = "/",
    tlsPolicy = "strict", pinnedCertSha256 = "", timeoutMs = 30000,
    username, password,
  } = cfg;
  assertSafeCommandToken(host, "host");
  assertSafeCommandToken(username, "username");
  assertSafeCommandToken(password, "password");
  assertSafeCommandToken(remoteDir, "remoteDir");

  let raw = await connectTcp(host, Number(port), timeoutMs);
  let tlsControl = null;
  let serverCertSha256 = null;

  try {
    if (protocol === "ftps-implicit") {
      tlsControl = await upgradeToTls(raw, host, timeoutMs, null);
      serverCertSha256 = verifyPeerCertificate(tlsControl, tlsPolicy, pinnedCertSha256);
    }
    const reader = createReplyReader(tlsControl ?? raw);
    const sendCmd = async (line, ms = timeoutMs) => {
      reader.stream.write(`${line}\r\n`);
      return reader.nextReply(ms);
    };

    const greeting = await reader.nextReply(timeoutMs);
    if (greeting.code !== 220) throw new FtpsError("ftp", `unexpected greeting: ${greeting.text}`);

    if (protocol === "ftps-explicit") {
      const auth = await sendCmd("AUTH TLS");
      if (auth.code !== 234) throw new FtpsError("ftp", `AUTH TLS refused: ${auth.text}`, null);
      tlsControl = await upgradeToTls(raw, host, timeoutMs, null);
      serverCertSha256 = verifyPeerCertificate(tlsControl, tlsPolicy, pinnedCertSha256);
      reader.replaceStream(tlsControl);
    }

    if (tlsControl) {
      const pbsz = await sendCmd("PBSZ 0");
      if (pbsz.code >= 400) throw new FtpsError("ftp", `PBSZ 0 refused: ${pbsz.text}`, serverCertSha256);
      const prot = await sendCmd("PROT P");
      if (prot.code >= 400) throw new FtpsError("ftp", `PROT P refused: ${prot.text}`, serverCertSha256);
    }

    const userRep = await sendCmd(`USER ${username}`);
    if (userRep.code !== 331 && userRep.code !== 230) {
      throw new FtpsError("auth", `USER rejected (${userRep.code})`, serverCertSha256);
    }
    if (userRep.code === 331) {
      const passRep = await sendCmd(`PASS ${password}`);
      if (passRep.code !== 230) throw new FtpsError("auth", `login rejected (${passRep.code})`, serverCertSha256);
    }

    const typeRep = await sendCmd("TYPE I");
    if (typeRep.code >= 400) throw new FtpsError("ftp", `TYPE I failed: ${typeRep.text}`, serverCertSha256);

    if (remoteDir && remoteDir !== "/") {
      const cwdRep = await sendCmd(`CWD ${remoteDir}`);
      if (cwdRep.code >= 400) throw new FtpsError("ftp", `CWD ${remoteDir} failed: ${cwdRep.text}`, serverCertSha256);
    }

    let closed = false;
    reader.stream.once("close", () => { closed = true; });

    return {
      serverCertSha256,
      isAlive: () => !closed && !reader.stream.destroyed,
      noop: async () => {
        const r = await sendCmd("NOOP");
        if (r.code >= 400) throw new FtpsError("ftp", `NOOP failed (${r.code})`, serverCertSha256);
      },
      uploadFile: async (fileName, bytes, onAbortHook) => {
        const safeName = assertSafeFileName(fileName);
        const dataPort = await negotiatePassivePort(sendCmd, timeoutMs);
        const dataTcp = await connectTcp(host, dataPort, timeoutMs);
        onAbortHook?.(() => { dataTcp.destroy(); reader.stream.destroy(); });

        const storPromise = sendCmd(`STOR ${safeName}`);
        let dataStream = dataTcp;
        if (tlsControl) {
          dataStream = await upgradeToTls(dataTcp, host, timeoutMs, tlsControl.getSession());
          verifyPeerCertificate(dataStream, tlsPolicy, pinnedCertSha256);
        }
        const storStart = await storPromise;
        if (storStart.code !== 150 && storStart.code !== 125) {
          dataStream.destroy();
          throw new FtpsError("ftp", `STOR rejected: ${storStart.text}`, serverCertSha256);
        }

        await new Promise((resolve, reject) => {
          dataStream.once("error", (err) => reject(new FtpsError("network", err.message, serverCertSha256)));
          dataStream.end(bytes, () => resolve());
        });
        const done = await reader.nextReply(timeoutMs);
        if (done.code !== 226 && done.code !== 250) {
          throw new FtpsError("ftp", `transfer did not complete cleanly: ${done.text}`, serverCertSha256);
        }
      },
      quit: async () => {
        if (closed || reader.stream.destroyed) return;
        closed = true;
        try { await sendCmd("QUIT", 3000); } catch { /* closing */ }
        reader.stream.destroy();
      },
      destroy: () => {
        closed = true;
        reader.stream.destroy();
        raw.destroy();
      },
    };
  } catch (err) {
    tlsControl?.destroy();
    raw.destroy();
    throw err;
  }
}
