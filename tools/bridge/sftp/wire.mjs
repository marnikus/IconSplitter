// wire.mjs — SSH-2 binary primitives and stateful AES-CTR + HMAC-SHA2 (ETM & MTE) framing (RFC 4251/4253 + OpenSSH ETM).

import crypto from "node:crypto";
import { FtpsError } from "../ftps/reply.mjs";

const MAX_PACKET_LEN = 262144;

export function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

export function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n), 0);
  return b;
}

export function sshBool(v) {
  return Buffer.from([v ? 1 : 0]);
}

export function sshStr(val) {
  const b = Buffer.isBuffer(val) ? val : Buffer.from(String(val), "utf8");
  return Buffer.concat([u32(b.length), b]);
}

export function sshNameList(list) {
  return sshStr(list.join(","));
}

export function sshMpint(raw) {
  let idx = 0;
  while (idx < raw.length && raw[idx] === 0) idx += 1;
  const trimmed = raw.subarray(idx);
  if (trimmed.length === 0) return u32(0);
  const body = (trimmed[0] & 0x80) !== 0 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
  return sshStr(body);
}

export class SshReader {
  constructor(buf) {
    this.buf = buf;
    this.off = 0;
  }

  byte() {
    if (this.off >= this.buf.length) throw new FtpsError("ftp", "truncated SSH packet");
    const v = this.buf[this.off];
    this.off += 1;
    return v;
  }

  bool() {
    return this.byte() !== 0;
  }

  u32() {
    if (this.off + 4 > this.buf.length) throw new FtpsError("ftp", "truncated SSH uint32");
    const v = this.buf.readUInt32BE(this.off);
    this.off += 4;
    return v;
  }

  bytes() {
    const len = this.u32();
    if (this.off + len > this.buf.length) throw new FtpsError("ftp", "truncated SSH string");
    const slice = this.buf.subarray(this.off, this.off + len);
    this.off += len;
    return slice;
  }

  str() {
    return this.bytes().toString("utf8");
  }

  nameList() {
    const s = this.str();
    return s === "" ? [] : s.split(",");
  }
}

function macSpec(macAlgo) {
  const etm = String(macAlgo ?? "").endsWith("-etm@openssh.com");
  const hash = String(macAlgo ?? "").includes("sha2-512") ? "sha512" : "sha256";
  return { etm, hash, len: hash === "sha512" ? 64 : 32 };
}

function padCount(unalignedLen, blockSize) {
  const rem = unalignedLen % blockSize;
  const pad = rem === 0 ? blockSize : blockSize - rem;
  return pad < 4 ? pad + blockSize : pad;
}

export function createSshFraming() {
  let tx = null;
  let rx = null;
  let txSeq = 0;
  let rxSeq = 0;
  let rxBuf = Buffer.alloc(0);
  let firstBlock = null;

  function encodePacket(payload) {
    const seq = txSeq;
    txSeq = (txSeq + 1) >>> 0;
    if (!tx) {
      const padLen = padCount(5 + payload.length, 8);
      return Buffer.concat([u32(1 + payload.length + padLen), Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]);
    }
    if (tx.etm) {
      const padLen = padCount(1 + payload.length, 16);
      const lenBuf = u32(1 + payload.length + padLen);
      const enc = tx.cipher.update(Buffer.concat([Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]));
      const mac = crypto.createHmac(tx.hash, tx.macKey).update(u32(seq)).update(lenBuf).update(enc).digest();
      return Buffer.concat([lenBuf, enc, mac]);
    }
    const padLen = padCount(5 + payload.length, 16);
    const plain = Buffer.concat([u32(1 + payload.length + padLen), Buffer.from([padLen]), payload, crypto.randomBytes(padLen)]);
    const mac = crypto.createHmac(tx.hash, tx.macKey).update(u32(seq)).update(plain).digest();
    return Buffer.concat([tx.cipher.update(plain), mac]);
  }

  function decodePlainPacket() {
    if (rxBuf.length < 4) return null;
    const pktLen = rxBuf.readUInt32BE(0);
    if (pktLen < 5 || pktLen > MAX_PACKET_LEN) throw new FtpsError("ftp", "invalid SSH packet length");
    if (rxBuf.length < 4 + pktLen) return null;
    const payload = Buffer.from(rxBuf.subarray(5, 4 + pktLen - rxBuf[4]));
    rxBuf = rxBuf.subarray(4 + pktLen);
    rxSeq = (rxSeq + 1) >>> 0;
    return payload;
  }

  function decodeEtmPacket() {
    if (rxBuf.length < 4) return null;
    const pktLen = rxBuf.readUInt32BE(0);
    if (pktLen < 5 || pktLen > MAX_PACKET_LEN || pktLen % 16 !== 0) {
      throw new FtpsError("ftp", "invalid encrypted ETM SSH packet length");
    }
    if (rxBuf.length < 4 + pktLen + rx.len) return null;
    const gotMac = rxBuf.subarray(4 + pktLen, 4 + pktLen + rx.len);
    const expMac = crypto.createHmac(rx.hash, rx.macKey).update(u32(rxSeq)).update(rxBuf.subarray(0, 4 + pktLen)).digest();
    if (!crypto.timingSafeEqual(gotMac, expMac)) throw new FtpsError("ftp", "SSH ETM packet MAC verification failed");
    const plainBody = rx.cipher.update(rxBuf.subarray(4, 4 + pktLen));
    rxBuf = rxBuf.subarray(4 + pktLen + rx.len);
    rxSeq = (rxSeq + 1) >>> 0;
    return Buffer.from(plainBody.subarray(1, pktLen - plainBody[0]));
  }

  function decodeMtePacket() {
    if (!firstBlock) {
      if (rxBuf.length < 16) return null;
      firstBlock = rx.cipher.update(rxBuf.subarray(0, 16));
    }
    const pktLen = firstBlock.readUInt32BE(0);
    if (pktLen < 5 || pktLen > MAX_PACKET_LEN) throw new FtpsError("ftp", "invalid encrypted SSH packet length");
    if (rxBuf.length < 4 + pktLen + rx.len) return null;
    const rest = 4 + pktLen > 16 ? rx.cipher.update(rxBuf.subarray(16, 4 + pktLen)) : Buffer.alloc(0);
    const plain = Buffer.concat([firstBlock, rest]);
    const gotMac = rxBuf.subarray(4 + pktLen, 4 + pktLen + rx.len);
    const expMac = crypto.createHmac(rx.hash, rx.macKey).update(u32(rxSeq)).update(plain).digest();
    firstBlock = null;
    rxBuf = rxBuf.subarray(4 + pktLen + rx.len);
    rxSeq = (rxSeq + 1) >>> 0;
    if (!crypto.timingSafeEqual(gotMac, expMac)) throw new FtpsError("ftp", "SSH packet MAC verification failed");
    return Buffer.from(plain.subarray(5, 4 + pktLen - plain[4]));
  }

  return {
    encodePacket,
    activateTx(cipher, macKey, macAlgo) { tx = { cipher, macKey, ...macSpec(macAlgo) }; },
    activateRx(cipher, macKey, macAlgo) { rx = { cipher, macKey, ...macSpec(macAlgo) }; },
    pushChunk(chunk) {
      rxBuf = Buffer.concat([rxBuf, chunk]);
      const out = [];
      while (true) {
        const pkt = !rx ? decodePlainPacket() : (rx.etm ? decodeEtmPacket() : decodeMtePacket());
        if (pkt === null) break;
        out.push(pkt);
      }
      return out;
    },
  };
}
