// kex.mjs — SSH-2 curve25519-sha256 / ecdh-sha2-nistp256 key exchange, host-key
// signature check, SHA-256 fingerprint pinning, and RFC 4253 + OpenSSH ETM key derivation.

import crypto from "node:crypto";
import { FtpsError } from "../ftps/reply.mjs";
import { SshReader, sshMpint, sshNameList, sshStr, u32 } from "./wire.mjs";

const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export const KEX_ALGOS = ["curve25519-sha256", "curve25519-sha256@libssh.org", "ecdh-sha2-nistp256"];
export const HOST_KEY_ALGOS = [
  "ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
  "rsa-sha2-512", "rsa-sha2-256",
];
export const CIPHER_ALGOS = ["aes256-ctr", "aes192-ctr", "aes128-ctr"];
export const MAC_ALGOS = [
  "hmac-sha2-256-etm@openssh.com", "hmac-sha2-512-etm@openssh.com",
  "hmac-sha2-256", "hmac-sha2-512",
];

const ECDSA_CURVES = {
  "ecdsa-sha2-nistp256": { sshCurve: "nistp256", jwkCrv: "P-256", coordLen: 32, hash: "sha256" },
  "ecdsa-sha2-nistp384": { sshCurve: "nistp384", jwkCrv: "P-384", coordLen: 48, hash: "sha384" },
  "ecdsa-sha2-nistp521": { sshCurve: "nistp521", jwkCrv: "P-521", coordLen: 66, hash: "sha512" },
};

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
  const r = new SshReader(payload.subarray(17));
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

export function createEphemeralKex(kexAlgo = "curve25519-sha256") {
  if (kexAlgo === "ecdh-sha2-nistp256") {
    const ecdh = crypto.createECDH("prime256v1");
    const qC = ecdh.generateKeys();
    return {
      qC,
      computeSharedMpint: (qS) => sshMpint(ecdh.computeSecret(qS)),
    };
  }
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

function verifyEcdsaSig(rKey, spec, sigBytes, exchangeHash) {
  if (rKey.str() !== spec.sshCurve) return false;
  const q = rKey.bytes();
  const n = spec.coordLen;
  if (q.length !== 1 + 2 * n || q[0] !== 4) return false;
  const pub = crypto.createPublicKey({
    key: {
      kty: "EC", crv: spec.jwkCrv,
      x: q.subarray(1, 1 + n).toString("base64url"),
      y: q.subarray(1 + n, 1 + 2 * n).toString("base64url"),
    },
    format: "jwk",
  });
  const rs = new SshReader(sigBytes);
  const rVal = stripLeadingZero(rs.bytes());
  const sVal = stripLeadingZero(rs.bytes());
  if (rVal.length > n || sVal.length > n) return false;
  const p1363 = Buffer.alloc(2 * n);
  rVal.copy(p1363, n - rVal.length);
  sVal.copy(p1363, 2 * n - sVal.length);
  return crypto.verify(spec.hash, exchangeHash, { key: pub, dsaEncoding: "ieee-p1363" }, p1363);
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
  const ecSpec = ECDSA_CURVES[keyType];
  if (ecSpec && sigAlgo === keyType) {
    return verifyEcdsaSig(rKey, ecSpec, sigBytes, exchangeHash);
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

function cipherSpec(sshCipher) {
  if (sshCipher === "aes256-ctr") return { nodeName: "aes-256-ctr", keyLen: 32 };
  if (sshCipher === "aes192-ctr") return { nodeName: "aes-192-ctr", keyLen: 24 };
  return { nodeName: "aes-128-ctr", keyLen: 16 };
}

export function buildSessionCiphers(kMpint, h, sessionId, negotiated) {
  const c2s = cipherSpec(negotiated.cipherC2S);
  const s2c = cipherSpec(negotiated.cipherS2C);
  const txMacLen = negotiated.macC2S.includes("sha2-512") ? 64 : 32;
  const rxMacLen = negotiated.macS2C.includes("sha2-512") ? 64 : 32;
  return {
    txCipher: crypto.createCipheriv(c2s.nodeName, deriveStream(kMpint, h, sessionId, "C", c2s.keyLen), deriveStream(kMpint, h, sessionId, "A", 16)),
    rxCipher: crypto.createDecipheriv(s2c.nodeName, deriveStream(kMpint, h, sessionId, "D", s2c.keyLen), deriveStream(kMpint, h, sessionId, "B", 16)),
    txMacKey: deriveStream(kMpint, h, sessionId, "E", txMacLen),
    rxMacKey: deriveStream(kMpint, h, sessionId, "F", rxMacLen),
    macC2S: negotiated.macC2S,
    macS2C: negotiated.macS2C,
  };
}
