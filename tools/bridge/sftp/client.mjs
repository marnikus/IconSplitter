// client.mjs — loopback Node SSH-2 + SFTP v3 client for Adobe Stock & SFTP targets.
// Uses built-in `node:net` + `node:crypto` only (zero npm dependencies).

import crypto from "node:crypto";
import net from "node:net";
import { FtpsError, assertSafeFileName } from "../ftps/reply.mjs";
import {
  buildClientKexInit, buildSessionCiphers, createEphemeralX25519,
  enforceSshHostKeyPolicy, parseServerKexInit, verifyHostKeySignature,
} from "./kex.mjs";
import { createSshFraming, SshReader, sshBool, sshStr, u32, u64 } from "./wire.mjs";

const CLIENT_BANNER = "SSH-2.0-IconSplitter_1.0";
const WRITE_CHUNK_BYTES = 24576;

function connectTcpWithBanner(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => { sock.destroy(); reject(new FtpsError("timeout", "SFTP connection timed out")); }, timeoutMs);
    sock.once("error", (err) => { clearTimeout(timer); reject(new FtpsError("network", `SFTP socket error: ${err.message}`)); });
    sock.once("connect", () => sock.write(`${CLIENT_BANNER}\r\n`));
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const nl = buf.indexOf("\n");
        if (nl < 0) return;
        const line = buf.subarray(0, nl).toString("utf8").replace(/\r$/, "");
        buf = buf.subarray(nl + 1);
        if (line.startsWith("SSH-2.0-") || line.startsWith("SSH-1.99-")) {
          clearTimeout(timer);
          sock.off("data", onData);
          resolve({ sock, serverBanner: line, initialRemainder: buf });
          return;
        }
      }
    };
    sock.on("data", onData);
  });
}

function createPacketDriver(sock, framing, timeoutMs) {
  const queue = [];
  const waiters = [];
  let closedErr = null;
  let onChannelData = null;
  let onWindowAdjust = null;

  function failAll(err) {
    closedErr = closedErr ?? err;
    while (waiters.length > 0) waiters.shift().reject(closedErr);
  }

  function dispatchPacket(pkt) {
    const msg = pkt[0];
    if (msg === 2 || msg === 4 || msg === 7) return; // IGNORE, DEBUG, EXT_INFO
    if (msg === 80) { // GLOBAL_REQUEST -> reply REQUEST_FAILURE if want_reply
      const r = new SshReader(pkt.subarray(1));
      r.str();
      if (r.bool()) sock.write(framing.encodePacket(Buffer.from([82])));
      return;
    }
    if (msg === 1) { failAll(new FtpsError("ftp", "SFTP server disconnected")); return; }
    if (msg === 93 && onWindowAdjust) { const r = new SshReader(pkt.subarray(1)); r.u32(); onWindowAdjust(r.u32()); return; }
    if (msg === 94 && onChannelData) { const r = new SshReader(pkt.subarray(1)); r.u32(); onChannelData(r.bytes()); return; }
    if (msg === 95) return; // CHANNEL_EXTENDED_DATA (stderr banner)
    const idx = waiters.findIndex((w) => w.accept(msg));
    if (idx >= 0) { const [w] = waiters.splice(idx, 1); clearTimeout(w.timer); w.resolve(pkt); return; }
    queue.push(pkt);
  }

  sock.on("data", (chunk) => {
    try { for (const p of framing.pushChunk(chunk)) dispatchPacket(p); }
    catch (err) { failAll(err instanceof FtpsError ? err : new FtpsError("ftp", err.message)); sock.destroy(); }
  });
  sock.on("error", (err) => failAll(new FtpsError("network", err.message)));
  sock.on("close", () => failAll(new FtpsError("network", "SFTP connection closed")));

  return {
    send(payload) { sock.write(framing.encodePacket(payload)); },
    pushInitial(rem) { if (rem.length > 0) for (const p of framing.pushChunk(rem)) dispatchPacket(p); },
    setChannelHooks(hooks) { onChannelData = hooks.onData; onWindowAdjust = hooks.onWindow; },
    waitMsg(types) {
      const accept = (m) => types.includes(m);
      const qIdx = queue.findIndex((p) => accept(p[0]));
      if (qIdx >= 0) return Promise.resolve(queue.splice(qIdx, 1)[0]);
      if (closedErr) return Promise.reject(closedErr);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new FtpsError("timeout", "SFTP server timed out")), timeoutMs);
        waiters.push({ accept, resolve, reject, timer });
      });
    },
  };
}

async function performHandshakeAndAuth(drv, framing, serverBanner, cfg) {
  const clientKex = buildClientKexInit();
  drv.send(clientKex);
  const serverKex = await drv.waitMsg([20]);
  const negotiated = parseServerKexInit(serverKex);
  const eph = createEphemeralX25519();
  drv.send(Buffer.concat([Buffer.from([30]), sshStr(eph.qC)]));

  const reply = await drv.waitMsg([31]);
  const r = new SshReader(reply.subarray(1));
  const hostKeyBlob = r.bytes();
  const qS = r.bytes();
  const sigBlob = r.bytes();
  const hostKeySha256 = crypto.createHash("sha256").update(hostKeyBlob).digest("hex");
  const kMpint = eph.computeSharedMpint(qS);
  const h = crypto.createHash("sha256")
    .update(sshStr(CLIENT_BANNER)).update(sshStr(serverBanner))
    .update(sshStr(clientKex)).update(sshStr(serverKex))
    .update(sshStr(hostKeyBlob)).update(sshStr(eph.qC)).update(sshStr(qS))
    .update(kMpint).digest();

  if (!verifyHostKeySignature(hostKeyBlob, sigBlob, h)) {
    throw new FtpsError("cert", "SSH server host key signature verification failed", hostKeySha256);
  }
  enforceSshHostKeyPolicy(hostKeySha256, cfg);

  drv.send(Buffer.from([21])); // NEWKEYS
  const ciphers = buildSessionCiphers(kMpint, h, h, negotiated);
  framing.activateTx(ciphers.txCipher, ciphers.txMacKey);
  await drv.waitMsg([21]);
  framing.activateRx(ciphers.rxCipher, ciphers.rxMacKey);

  drv.send(Buffer.concat([Buffer.from([5]), sshStr("ssh-userauth")]));
  await drv.waitMsg([6]);
  await authenticatePasswordOrKbd(drv, cfg, hostKeySha256);
  return hostKeySha256;
}

async function authenticatePasswordOrKbd(drv, cfg, hostKeySha256) {
  drv.send(Buffer.concat([
    Buffer.from([50]), sshStr(cfg.username), sshStr("ssh-connection"),
    sshStr("password"), sshBool(false), sshStr(cfg.password),
  ]));
  const res = await drv.waitMsg([51, 52, 60]);
  if (res[0] === 52) return;
  if (res[0] === 51) {
    const methods = new SshReader(res.subarray(1)).nameList();
    if (methods.includes("keyboard-interactive")) {
      await tryKeyboardInteractive(drv, cfg, hostKeySha256);
      return;
    }
  }
  throw new FtpsError("auth", "SFTP authentication failed — check SFTP ID and generated password", hostKeySha256);
}

async function tryKeyboardInteractive(drv, cfg, hostKeySha256) {
  drv.send(Buffer.concat([
    Buffer.from([50]), sshStr(cfg.username), sshStr("ssh-connection"),
    sshStr("keyboard-interactive"), sshStr(""), sshStr(""),
  ]));
  for (let round = 0; round < 4; round += 1) {
    const pkt = await drv.waitMsg([51, 52, 60]);
    if (pkt[0] === 52) return;
    if (pkt[0] === 51) break;
    const r = new SshReader(pkt.subarray(1));
    r.str(); r.str(); r.str();
    const numPrompts = r.u32();
    const parts = [Buffer.from([61]), u32(numPrompts)];
    for (let i = 0; i < numPrompts; i += 1) parts.push(sshStr(cfg.password));
    drv.send(Buffer.concat(parts));
  }
  throw new FtpsError("auth", "SFTP authentication failed — check SFTP ID and generated password", hostKeySha256);
}

async function openSftpChannel(drv, timeoutMs) {
  drv.send(Buffer.concat([Buffer.from([90]), sshStr("session"), u32(0), u32(2 * 1024 * 1024), u32(32768)]));
  const openConf = await drv.waitMsg([91, 92]);
  if (openConf[0] === 92) throw new FtpsError("ftp", "SFTP server refused SSH session channel");
  const r = new SshReader(openConf.subarray(1));
  r.u32();
  const remoteChan = r.u32();
  let peerWindow = r.u32();
  const windowWaiters = [];
  let sftpBuf = Buffer.alloc(0);
  const pending = new Map();
  let versionWaiter = null;
  let nextId = 1;

  drv.setChannelHooks({
    onWindow(add) {
      peerWindow += add;
      while (peerWindow > 0 && windowWaiters.length > 0) windowWaiters.shift()();
    },
    onData(chunk) {
      drv.send(Buffer.concat([Buffer.from([93]), u32(remoteChan), u32(chunk.length)]));
      sftpBuf = Buffer.concat([sftpBuf, chunk]);
      while (sftpBuf.length >= 4) {
        const len = sftpBuf.readUInt32BE(0);
        if (sftpBuf.length < 4 + len) break;
        const pkt = sftpBuf.subarray(4, 4 + len);
        sftpBuf = sftpBuf.subarray(4 + len);
        if (pkt[0] === 2 && versionWaiter) { versionWaiter(pkt); versionWaiter = null; continue; }
        const reqId = pkt.readUInt32BE(1);
        const hit = pending.get(reqId);
        if (hit) { pending.delete(reqId); clearTimeout(hit.timer); hit.resolve(pkt); }
      }
    },
  });

  drv.send(Buffer.concat([Buffer.from([98]), u32(remoteChan), sshStr("subsystem"), sshBool(true), sshStr("sftp")]));
  const subRes = await drv.waitMsg([99, 100]);
  if (subRes[0] !== 99) throw new FtpsError("ftp", "SSH server refused SFTP subsystem");

  async function sendChannelBytes(raw) {
    let off = 0;
    while (off < raw.length) {
      while (peerWindow === 0) await new Promise((res) => windowWaiters.push(res));
      const take = Math.min(raw.length - off, peerWindow, 30000);
      peerWindow -= take;
      drv.send(Buffer.concat([Buffer.from([94]), u32(remoteChan), sshStr(raw.subarray(off, off + take))]));
      off += take;
    }
  }

  function requestSftp(type, bodyParts) {
    const reqId = nextId++;
    const inner = Buffer.concat([Buffer.from([type]), u32(reqId), ...bodyParts]);
    const framed = Buffer.concat([u32(inner.length), inner]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(reqId); reject(new FtpsError("timeout", "SFTP operation timed out")); }, timeoutMs);
      pending.set(reqId, { resolve, reject, timer });
      sendChannelBytes(framed).catch((e) => { clearTimeout(timer); pending.delete(reqId); reject(e); });
    });
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new FtpsError("timeout", "SFTP INIT timed out")), timeoutMs);
    versionWaiter = () => { clearTimeout(timer); resolve(); };
    const initInner = Buffer.concat([Buffer.from([1]), u32(3)]);
    sendChannelBytes(Buffer.concat([u32(initInner.length), initInner])).catch(reject);
  });

  return { remoteChan, requestSftp };
}

function expectSftpOk(pkt, opName) {
  if (pkt[0] !== 101) throw new FtpsError("ftp", `unexpected SFTP reply (${pkt[0]}) during ${opName}`);
  const r = new SshReader(pkt.subarray(5));
  const code = r.u32();
  const msg = r.str();
  if (code !== 0) throw new FtpsError("ftp", `SFTP ${opName} failed (${code}): ${msg || "rejected"}`);
}

export async function openSftpSession(cfg) {
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 30000;
  const host = String(cfg.host).trim();
  const port = Number(cfg.port) > 0 ? Number(cfg.port) : 22;
  const { sock, serverBanner, initialRemainder } = await connectTcpWithBanner(host, port, timeoutMs);
  const framing = createSshFraming();
  const drv = createPacketDriver(sock, framing, timeoutMs);
  drv.pushInitial(initialRemainder);

  try {
    const hostKeySha256 = await performHandshakeAndAuth(drv, framing, serverBanner, cfg);
    const { remoteChan, requestSftp } = await openSftpChannel(drv, timeoutMs);

    async function resolveRemoteBase() {
      const rawDir = typeof cfg.remoteDir === "string" ? cfg.remoteDir.trim() : "/";
      const query = rawDir === "" || rawDir === "/" ? "." : rawDir.replace(/^\/+/, "");
      const pkt = await requestSftp(16, [sshStr(query)]);
      if (pkt[0] !== 104) expectSftpOk(pkt, "REALPATH");
      const r = new SshReader(pkt.subarray(5));
      r.u32(); // count
      return r.str() || "/";
    }

    return {
      serverCertSha256: hostKeySha256,
      isAlive: () => !sock.destroyed && sock.writable,
      noop: async () => { await resolveRemoteBase(); },
      uploadFile: async (rawName, bytes, onAbort) => {
        const cleanName = assertSafeFileName(rawName);
        if (onAbort) onAbort(() => sock.destroy());
        const base = await resolveRemoteBase();
        const remotePath = base === "/" ? `/${cleanName}` : `${base.replace(/\/+$/, "")}/${cleanName}`;
        const openPkt = await requestSftp(3, [sshStr(remotePath), u32(0x1a), u32(0)]);
        if (openPkt[0] !== 102) expectSftpOk(openPkt, "OPEN");
        const handle = new SshReader(openPkt.subarray(5)).bytes();
        for (let off = 0; off < bytes.length; off += WRITE_CHUNK_BYTES) {
          const slice = bytes.subarray(off, Math.min(bytes.length, off + WRITE_CHUNK_BYTES));
          const writePkt = await requestSftp(6, [sshStr(handle), u64(off), sshStr(slice)]);
          expectSftpOk(writePkt, "WRITE");
        }
        const closePkt = await requestSftp(4, [sshStr(handle)]);
        expectSftpOk(closePkt, "CLOSE");
      },
      quit: async () => {
        try { if (!sock.destroyed) drv.send(Buffer.concat([Buffer.from([97]), u32(remoteChan)])); } catch { /* ignore */ }
        sock.destroy();
      },
      destroy: () => sock.destroy(),
    };
  } catch (err) {
    sock.destroy();
    throw err;
  }
}
