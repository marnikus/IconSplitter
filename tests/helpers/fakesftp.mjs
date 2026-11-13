// fakesftp.mjs — real in-memory SSH-2 + SFTP v3 server on 127.0.0.1:0 using
// Node 22 built-in `node:net` + `node:crypto` (ephemeral keys in memory, zero disk files).
// Supports both classic (`ssh-ed25519` + `aes128-ctr` + `hmac-sha2-256`) and AWS Transfer
// Family `TransferSecurityPolicy-2024-01` (`rsa-sha2-512` + `aes256-ctr` + `hmac-sha2-256-etm@openssh.com`).

import crypto from "node:crypto";
import net from "node:net";

const SPKI_X25519_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };
const sshStr = (v) => { const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), "utf8"); return Buffer.concat([u32(b.length), b]); };

function sshMpint(raw) {
  let i = 0;
  while (i < raw.length && raw[i] === 0) i += 1;
  const trimmed = raw.subarray(i);
  if (trimmed.length === 0) return u32(0);
  return sshStr((trimmed[0] & 0x80) ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}

class Reader {
  constructor(buf) { this.buf = buf; this.off = 0; }
  byte() { return this.buf[this.off++]; }
  bool() { return this.byte() !== 0; }
  u32() { const v = this.buf.readUInt32BE(this.off); this.off += 4; return v; }
  u64() { const v = Number(this.buf.readBigUInt64BE(this.off)); this.off += 8; return v; }
  bytes() { const len = this.u32(); const out = this.buf.subarray(this.off, this.off + len); this.off += len; return out; }
  str() { return this.bytes().toString("utf8"); }
}

function makeHostIdentity(awsPolicy2024) {
  if (!awsPolicy2024) {
    const pair = crypto.generateKeyPairSync("ed25519");
    const rawPub = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
    const blob = Buffer.concat([sshStr("ssh-ed25519"), sshStr(rawPub)]);
    return {
      hostKeyAlgo: "ssh-ed25519",
      blob,
      sha256: crypto.createHash("sha256").update(blob).digest("hex"),
      sign: (h) => Buffer.concat([sshStr("ssh-ed25519"), sshStr(crypto.sign(null, h, pair.privateKey))]),
    };
  }
  const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const eBuf = Buffer.from(jwk.e, "base64url");
  const nBuf = Buffer.from(jwk.n, "base64url");
  const blob = Buffer.concat([sshStr("ssh-rsa"), sshMpint(eBuf), sshMpint(nBuf)]);
  return {
    hostKeyAlgo: "rsa-sha2-512",
    blob,
    sha256: crypto.createHash("sha256").update(blob).digest("hex"),
    sign: (h) => Buffer.concat([sshStr("rsa-sha2-512"), sshStr(crypto.sign("sha512", h, pair.privateKey))]),
  };
}

function buildKexInit(awsPolicy2024, hostKeyAlgo) {
  const cipher = awsPolicy2024 ? "aes256-ctr" : "aes128-ctr";
  const mac = awsPolicy2024 ? "hmac-sha2-256-etm@openssh.com" : "hmac-sha2-256";
  return Buffer.concat([
    Buffer.from([20]),
    crypto.randomBytes(16),
    sshStr("curve25519-sha256,curve25519-sha256@libssh.org"),
    sshStr(hostKeyAlgo),
    sshStr(cipher),
    sshStr(cipher),
    sshStr(mac),
    sshStr(mac),
    sshStr("none"),
    sshStr("none"),
    sshStr(""),
    sshStr(""),
    Buffer.from([0]),
    u32(0),
  ]);
}

function deriveKey(kMpint, h, sessionId, letter, len) {
  const k1 = crypto.createHash("sha256").update(kMpint).update(h).update(Buffer.from(letter)).update(sessionId).digest();
  if (len <= 32) return k1.subarray(0, len);
  const k2 = crypto.createHash("sha256").update(kMpint).update(h).update(k1).digest();
  return Buffer.concat([k1, k2]).subarray(0, len);
}

export async function startFakeSftpServer(opts = {}) {
  const expectedUser = opts.username ?? "210333617";
  const expectedPass = opts.password ?? "AdobeGeneratedPass!99";
  const awsPolicy2024 = Boolean(opts.awsPolicy2024);
  const maxChanPacket = opts.maxChannelPacket ?? (awsPolicy2024 ? 16384 : 32768);
  const hostId = makeHostIdentity(awsPolicy2024);

  const uploaded = new Map();
  const sockets = new Set();
  let logins = 0;

  function onConnection(sock) {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});

    const serverBanner = awsPolicy2024 ? "SSH-2.0-AWS_SFTP_1.1" : "SSH-2.0-FakeAdobeSFTP_1.0";
    sock.write(`${serverBanner}\r\n`);

    let buf = Buffer.alloc(0);
    let clientBanner = null;
    let clientKexInit = null;
    const serverKexInit = buildKexInit(awsPolicy2024, hostId.hostKeyAlgo);
    let sessionId = null;
    let pendingKeys = null;
    let txCipher = null;
    let txMac = null;
    let rxCipher = null;
    let rxMac = null;
    let txSeq = 0;
    let rxSeq = 0;
    let firstBlock = null;
    let authed = false;
    let clientChan = 0;
    let sftpBuf = Buffer.alloc(0);
    const openHandles = new Map();
    let nextHandle = 1;

    function sendPacket(payload) {
      if (!txCipher) {
        const rem = (5 + payload.length) % 8;
        let padLen = rem === 0 ? 8 : 8 - rem;
        if (padLen < 4) padLen += 8;
        txSeq += 1;
        sock.write(Buffer.concat([u32(1 + payload.length + padLen), Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]));
        return;
      }
      const seq = txSeq++;
      if (awsPolicy2024) {
        const rem = (1 + payload.length) % 16;
        let padLen = rem === 0 ? 16 : 16 - rem;
        if (padLen < 4) padLen += 16;
        const lenBuf = u32(1 + payload.length + padLen);
        const enc = txCipher.update(Buffer.concat([Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]));
        const mac = crypto.createHmac("sha256", txMac).update(u32(seq)).update(lenBuf).update(enc).digest();
        sock.write(Buffer.concat([lenBuf, enc, mac]));
        return;
      }
      const rem = (5 + payload.length) % 16;
      let padLen = rem === 0 ? 16 : 16 - rem;
      if (padLen < 4) padLen += 16;
      const plain = Buffer.concat([u32(1 + payload.length + padLen), Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]);
      const mac = crypto.createHmac("sha256", txMac).update(u32(seq)).update(plain).digest();
      sock.write(Buffer.concat([txCipher.update(plain), mac]));
    }

    function sendChannelData(data) {
      sendPacket(Buffer.concat([Buffer.from([94]), u32(clientChan), sshStr(data)]));
    }

    function sendSftp(type, body) {
      const pkt = Buffer.concat([Buffer.from([type]), body]);
      sendChannelData(Buffer.concat([u32(pkt.length), pkt]));
    }

    function sendSftpStatus(reqId, code, msg) {
      sendSftp(101, Buffer.concat([u32(reqId), u32(code), sshStr(msg), sshStr("en")]));
    }

    function handleSftpPacket(pkt) {
      const r = new Reader(pkt);
      const type = r.byte();
      if (type === 1) { sendSftp(2, u32(3)); return; }
      const reqId = r.u32();
      if (type === 16) {
        const p = r.str();
        const norm = (p === "" || p === "." || p === "/") ? "/" : (p.startsWith("/") ? p : `/${p}`);
        sendSftp(104, Buffer.concat([u32(reqId), u32(1), sshStr(norm), sshStr(norm), u32(0)]));
      } else if (type === 3) {
        const filename = r.str();
        const hid = `h${nextHandle++}`;
        openHandles.set(hid, { filename: filename.startsWith("/") ? filename : `/${filename}`, chunks: [] });
        sendSftp(102, Buffer.concat([u32(reqId), sshStr(hid)]));
      } else if (type === 6) {
        const hid = r.str();
        const offset = r.u64();
        const data = r.bytes();
        const entry = openHandles.get(hid);
        if (!entry) { sendSftpStatus(reqId, 4, "invalid handle"); return; }
        entry.chunks.push({ offset, data: Buffer.from(data) });
        sendSftpStatus(reqId, 0, "ok");
      } else if (type === 4) {
        const hid = r.str();
        const entry = openHandles.get(hid);
        if (!entry) { sendSftpStatus(reqId, 4, "invalid handle"); return; }
        openHandles.delete(hid);
        const total = entry.chunks.reduce((m, c) => Math.max(m, c.offset + c.data.length), 0);
        const out = Buffer.alloc(total);
        for (const c of entry.chunks) c.data.copy(out, c.offset);
        uploaded.set(entry.filename, new Uint8Array(out));
        sendSftpStatus(reqId, 0, "ok");
      } else {
        sendSftpStatus(reqId, 8, "unsupported");
      }
    }

    function handlePayload(payload) {
      const msg = payload[0];
      const r = new Reader(payload.subarray(1));
      if (msg === 20) {
        clientKexInit = Buffer.from(payload);
        sendPacket(serverKexInit);
      } else if (msg === 30) {
        const qC = r.bytes();
        const eph = crypto.generateKeyPairSync("x25519");
        const qS = eph.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
        const peerPub = crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519_PREFIX, qC]), format: "der", type: "spki" });
        const kMpint = sshMpint(crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: peerPub }));
        const h = crypto.createHash("sha256")
          .update(sshStr(clientBanner)).update(sshStr(serverBanner))
          .update(sshStr(clientKexInit)).update(sshStr(serverKexInit))
          .update(sshStr(hostId.blob)).update(sshStr(qC)).update(sshStr(qS))
          .update(kMpint).digest();
        if (!sessionId) sessionId = h;
        const sigBlob = hostId.sign(h);
        sendPacket(Buffer.concat([Buffer.from([31]), sshStr(hostId.blob), sshStr(qS), sshStr(sigBlob)]));
        const keyLen = awsPolicy2024 ? 32 : 16;
        const cipherName = awsPolicy2024 ? "aes-256-ctr" : "aes-128-ctr";
        pendingKeys = {
          cipherName,
          ivC2S: deriveKey(kMpint, h, sessionId, "A", 16),
          ivS2C: deriveKey(kMpint, h, sessionId, "B", 16),
          encC2S: deriveKey(kMpint, h, sessionId, "C", keyLen),
          encS2C: deriveKey(kMpint, h, sessionId, "D", keyLen),
          macC2S: deriveKey(kMpint, h, sessionId, "E", 32),
          macS2C: deriveKey(kMpint, h, sessionId, "F", 32),
        };
        sendPacket(Buffer.from([21]));
        txCipher = crypto.createCipheriv(cipherName, pendingKeys.encS2C, pendingKeys.ivS2C);
        txMac = pendingKeys.macS2C;
      } else if (msg === 21) {
        rxCipher = crypto.createDecipheriv(pendingKeys.cipherName, pendingKeys.encC2S, pendingKeys.ivC2S);
        rxMac = pendingKeys.macC2S;
      } else if (msg === 5) {
        const svc = r.str();
        sendPacket(Buffer.concat([Buffer.from([6]), sshStr(svc)]));
      } else if (msg === 50) {
        const user = r.str();
        r.str();
        const method = r.str();
        if (awsPolicy2024) sendPacket(Buffer.concat([Buffer.from([53]), sshStr("Welcome to AWS Transfer\n"), sshStr("en")]));
        if (method === "password") {
          r.bool();
          const pass = r.str();
          if (user === expectedUser && pass === expectedPass) {
            authed = true;
            logins += 1;
            sendPacket(Buffer.from([52]));
            return;
          }
        }
        sendPacket(Buffer.concat([Buffer.from([51]), sshStr("password"), Buffer.from([0])]));
      } else if (msg === 90 && authed) {
        r.str();
        clientChan = r.u32();
        sendPacket(Buffer.concat([Buffer.from([91]), u32(clientChan), u32(0), u32(2 * 1024 * 1024), u32(maxChanPacket)]));
      } else if (msg === 98 && authed) {
        r.u32();
        const reqType = r.str();
        const wantReply = r.bool();
        if (wantReply) sendPacket(Buffer.concat([Buffer.from([reqType === "subsystem" ? 99 : 100]), u32(clientChan)]));
      } else if (msg === 94 && authed) {
        r.u32();
        const chunk = r.bytes();
        if (chunk.length > maxChanPacket) { sock.destroy(); return; }
        sendPacket(Buffer.concat([Buffer.from([93]), u32(clientChan), u32(chunk.length)]));
        sftpBuf = Buffer.concat([sftpBuf, chunk]);
        while (sftpBuf.length >= 4) {
          const len = sftpBuf.readUInt32BE(0);
          if (sftpBuf.length < 4 + len) break;
          const pkt = sftpBuf.subarray(4, 4 + len);
          sftpBuf = sftpBuf.subarray(4 + len);
          handleSftpPacket(pkt);
        }
      } else if (msg === 96 || msg === 97 || msg === 1) {
        sock.end();
      }
    }

    function drainPackets() {
      while (true) {
        if (!rxCipher) {
          if (buf.length < 4) return;
          const pktLen = buf.readUInt32BE(0);
          if (buf.length < 4 + pktLen) return;
          const padLen = buf[4];
          const payload = buf.subarray(5, 4 + pktLen - padLen);
          buf = buf.subarray(4 + pktLen);
          rxSeq += 1;
          handlePayload(payload);
        } else if (awsPolicy2024) {
          if (buf.length < 4) return;
          const pktLen = buf.readUInt32BE(0);
          if (pktLen % 16 !== 0) { sock.destroy(); return; }
          if (buf.length < 4 + pktLen + 32) return;
          const gotMac = buf.subarray(4 + pktLen, 4 + pktLen + 32);
          const expMac = crypto.createHmac("sha256", rxMac).update(u32(rxSeq)).update(buf.subarray(0, 4 + pktLen)).digest();
          if (!crypto.timingSafeEqual(gotMac, expMac)) { sock.destroy(); return; }
          const plainBody = rxCipher.update(buf.subarray(4, 4 + pktLen));
          buf = buf.subarray(4 + pktLen + 32);
          rxSeq += 1;
          handlePayload(plainBody.subarray(1, pktLen - plainBody[0]));
        } else {
          if (!firstBlock) {
            if (buf.length < 16) return;
            firstBlock = rxCipher.update(buf.subarray(0, 16));
          }
          const pktLen = firstBlock.readUInt32BE(0);
          if (buf.length < 4 + pktLen + 32) return;
          const rest = (4 + pktLen > 16) ? rxCipher.update(buf.subarray(16, 4 + pktLen)) : Buffer.alloc(0);
          const plain = Buffer.concat([firstBlock, rest]);
          const gotMac = buf.subarray(4 + pktLen, 4 + pktLen + 32);
          const expMac = crypto.createHmac("sha256", rxMac).update(u32(rxSeq)).update(plain).digest();
          firstBlock = null;
          buf = buf.subarray(4 + pktLen + 32);
          rxSeq += 1;
          if (!crypto.timingSafeEqual(gotMac, expMac)) { sock.destroy(); return; }
          handlePayload(plain.subarray(5, 4 + pktLen - plain[4]));
        }
      }
    }

    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!clientBanner) {
        const idx = buf.indexOf("\r\n");
        if (idx < 0) return;
        clientBanner = buf.subarray(0, idx).toString("utf8");
        buf = buf.subarray(idx + 2);
      }
      drainPackets();
    });
  }

  const server = net.createServer(onConnection);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  return {
    host: "127.0.0.1",
    port,
    hostKeySha256: hostId.sha256,
    uploaded,
    getLogins: () => logins,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
