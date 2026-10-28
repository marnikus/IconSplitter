// kex.mjs — SSH-2 curve25519-sha256 key exchange, host-key signature check,
// SHA-256 fingerprint pinning, and RFC 4253 cipher/MAC key derivation.

import crypto from "node:crypto";
import { FtpsError } from "../ftps/reply.mjs";
import { SshReader, sshMpint, sshNameList, sshStr, u32 } from "./wire.mjs";

const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export const KEX_ALGOS = ["curve25519-sha256", "curve25519-sha256@libssh.org"];
export const HOST_KEY_ALGOS = ["ssh-ed25519", "ecdsa-sha2-nistp256", "rsa-sha2-256", "rsa-sha2-512"];
export const CIPHER_ALGOS = ["aes128-ctr", "aes256-ctr"];
export const MAC_ALGOS = ["hmac-sha2-256"];

export function buildClientKexInit() {
  return Buffer.concat([
    Buffer.from([20]),
    crypto.randomBytes(16),
    sshNameList(KEX_ALGOS),
    sshNameList(HOST_KEY_ALGOS),
    sshNameList(CIPHER_ALGOS),
    sshNameList(CIPHER_ALGOS),
    sshNameList(MAC_ALGOS),
    sshNameList(MAC_ALGOS),
    sshNameList(["none"]),
    sshNameList(["none"]),
    sshStr(""),
    sshStr(""),
    Buffer.from([0]),
    u32(0),
  ]);
}

function negotiateFirst(clientList, serverList, label) {
  const match = clientList.find((item) => serverList.includes(item));
  if (!match) throw new FtpsError("ftp", `SFTP server has no compatible ${label}`);
  return match;
}

export function parseServerKexInit(payload) {
  const r = new SshReader(payload.subarray(17)); // msg(1) + cookie(16)
  const kex = r.nameList();
  const hostKeys = r.nameList();
  const c2sCipher = r.nameList();
  const s2cCipher = r.nameList();
  const c2sMac = r.nameList();
  const s2cMac = r.nameList();
  return {
    kexAlgo: negotiateFirst(KEX_ALGOS, kex, "key exchange"),
    hostKeyAlgo: negotiateFirst(HOST_KEY_ALGOS, hostKeys, "host key algorithm"),
    cipherC2S: negotiateFirst(CIPHER_ALGOS, c2sCipher, "client cipher"),
    cipherS2C: negotiateFirst(CIPHER_ALGOS, s2cCipher, "server cipher"),
    macC2S: negotiateFirst(MAC_ALGOS, c2sMac, "client MAC"),
    macS2C: negotiateFirst(MAC_ALGOS, s2cMac, "server MAC"),
  };
}

export function createEphemeralX25519() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const qC = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  return {
    qC,
    computeSharedMpint(qS) {
      if (qS.length !== 32) throw new FtpsError("ftp", "invalid server X25519 public key");
      const peerPub = crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519, qS]), format: "der", type: "spki" });
      return sshMpint(crypto.diffieHellman({ privateKey, publicKey: peerPub }));
    },
  };
}

function stripLeadingZero(buf) {
  let i = 0;
  while (i < buf.length && buf[i] === 0) i += 1;
  return buf.subarray(i);
}

function verifyRsaSig(rKey, sigAlgo, sigBytes, exchangeHash) {
  const e = stripLeadingZero(rKey.bytes());
  const n = stripLeadingZero(rKey.bytes());
  const pub = crypto.createPublicKey({
    key: { kty: "RSA", n: n.toString("base64url"), e: e.toString("base64url") },
    format: "jwk",
  });
  const hashAlgo = sigAlgo === "rsa-sha2-512" ? "sha512" : "sha256";
  return crypto.verify(hashAlgo, exchangeHash, pub, sigBytes);
}

function verifyEcdsaP256Sig(rKey, sigBytes, exchangeHash) {
  rKey.str(); // "nistp256"
  const q = rKey.bytes();
  if (q.length !== 65 || q[0] !== 4) return false;
  const pub = crypto.createPublicKey({
    key: { kty: "EC", crv: "P-256", x: q.subarray(1, 33).toString("base64url"), y: q.subarray(33, 65).toString("base64url") },
    format: "jwk",
  });
  const rs = new SshReader(sigBytes);
  const rVal = stripLeadingZero(rs.bytes());
  const sVal = stripLeadingZero(rs.bytes());
  if (rVal.length > 32 || sVal.length > 32) return false;
  const p1363 = Buffer.alloc(64);
  rVal.copy(p1363, 32 - rVal.length);
  sVal.copy(p1363, 64 - sVal.length);
  return crypto.verify("sha256", exchangeHash, { key: pub, dsaEncoding: "ieee-p1363" }, p1363);
}

export function verifyHostKeySignature(hostKeyBlob, sigBlob, exchangeHash) {
  const rKey = new SshReader(hostKeyBlob);
  const keyType = rKey.str();
  const rSig = new SshReader(sigBlob);
  const sigAlgo = rSig.str();
  const sigBytes = rSig.bytes();
  if (keyType === "ssh-ed25519" && sigAlgo === "ssh-ed25519") {
    const rawPub = rKey.bytes();
    const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, rawPub]), format: "der", type: "spki" });
    return crypto.verify(null, exchangeHash, pub, sigBytes);
  }
  if (keyType === "ssh-rsa" && (sigAlgo === "rsa-sha2-256" || sigAlgo === "rsa-sha2-512")) {
    return verifyRsaSig(rKey, sigAlgo, sigBytes, exchangeHash);
  }
  if (keyType === "ecdsa-sha2-nistp256" && sigAlgo === "ecdsa-sha2-nistp256") {
    return verifyEcdsaP256Sig(rKey, sigBytes, exchangeHash);
  }
  return false;
}

export function enforceSshHostKeyPolicy(hostKeySha256, cfg) {
  if (cfg.tlsPolicy === "accept-self-signed") return;
  const pin = String(cfg.pinnedCertSha256 ?? "").trim().replace(/^sha-?256:/i, "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (cfg.tlsPolicy === "pinned") {
    if (!pin || pin !== hostKeySha256) {
      throw new FtpsError("cert", `SSH host key SHA-256 mismatch (server presented ${hostKeySha256})`, hostKeySha256);
    }
    return;
  }
  throw new FtpsError(
    "cert",
    `Untrusted SSH host key (SHA-256: ${hostKeySha256}) — confirm & pin this host key if expected`,
    hostKeySha256,
  );
}

function deriveStream(kMpint, h, sessionId, letter, length) {
  const k1 = crypto.createHash("sha256").update(kMpint).update(h).update(Buffer.from(letter)).update(sessionId).digest();
  if (length <= 32) return k1.subarray(0, length);
  const k2 = crypto.createHash("sha256").update(kMpint).update(h).update(k1).digest();
  return Buffer.concat([k1, k2]).subarray(0, length);
}

export function buildSessionCiphers(kMpint, h, sessionId, negotiated) {
  const c2sLen = negotiated.cipherC2S === "aes256-ctr" ? 32 : 16;
  const s2cLen = negotiated.cipherS2C === "aes256-ctr" ? 32 : 16;
  const c2sAlgo = negotiated.cipherC2S === "aes256-ctr" ? "aes-256-ctr" : "aes-128-ctr";
  const s2cAlgo = negotiated.cipherS2C === "aes256-ctr" ? "aes-256-ctr" : "aes-128-ctr";
  return {
    txCipher: crypto.createCipheriv(c2sAlgo, deriveStream(kMpint, h, sessionId, "C", c2sLen), deriveStream(kMpint, h, sessionId, "A", 16)),
    rxCipher: crypto.createDecipheriv(s2cAlgo, deriveStream(kMpint, h, sessionId, "D", s2cLen), deriveStream(kMpint, h, sessionId, "B", 16)),
    txMacKey: deriveStream(kMpint, h, sessionId, "E", 32),
    rxMacKey: deriveStream(kMpint, h, sessionId, "F", 32),
  };
}
