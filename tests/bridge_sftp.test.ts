// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeBridgeFtpsSession,
  testBridgeFtps,
  uploadBridgeFtps,
} from "../src/lib/stockupload/bridgeclient";
import { ADOBE_STOCK_PRESET } from "../src/lib/stockupload/presets";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
import { startFakeSftpServer, type FakeSftpServer } from "./helpers/fakesftp.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const liveHelpers: Helper[] = [];
const liveSftp: FakeSftpServer[] = [];

async function startHelper(): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "sftp-bridge-test-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0"], {
    env: { ...process.env, INKSCAPE_PATH: "/nonexistent/inkscape", BRIDGE_TMP: tmp },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log: string[] = [];
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`helper timeout:\n${log.join("\n")}`)), 8000);
    const onChunk = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim() === "") continue;
        log.push(line);
        const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(line);
        if (m !== null) { clearTimeout(timer); resolve(m[1]); }
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
  const h = { url, child, log, tmp };
  liveHelpers.push(h);
  return h;
}

afterEach(async () => {
  for (const h of liveHelpers.splice(0)) {
    h.child.kill();
    await new Promise((r) => h.child.once("exit", r));
    rmSync(h.tmp, { recursive: true, force: true });
  }
  for (const s of liveSftp.splice(0)) await s.close();
});

function makeAdobePreset(port: number, patch: Partial<StockFtpPreset> = {}): StockFtpPreset {
  return {
    ...ADOBE_STOCK_PRESET,
    host: "127.0.0.1",
    port,
    timeoutMs: 10000,
    ...patch,
  };
}

describe("local loopback SFTP bridge (Adobe Stock port 22 protocol)", () => {
  it("surfaces untrusted SSH host key SHA-256 under strict policy, succeeds when pinned, and rejects bad passwords", async () => {
    const h = await startHelper();
    const sftp = await startFakeSftpServer({ username: "210333617", password: "AdobeGeneratedPass!99" });
    liveSftp.push(sftp);

    // 1. Strict SSH policy prompts with exact host key SHA-256 for one-click pinning
    const strictRes = await testBridgeFtps(h.url, makeAdobePreset(sftp.port), {
      username: "210333617", password: "AdobeGeneratedPass!99",
    });
    expect(strictRes.ok).toBe(false);
    if (!strictRes.ok) {
      expect(strictRes.code).toBe("cert");
      expect(strictRes.serverCertSha256).toBe(sftp.hostKeySha256);
    }

    // 2. Pinned SSH host key SHA-256 authenticates and verifies SFTP REALPATH
    const pinnedRes = await testBridgeFtps(
      h.url,
      makeAdobePreset(sftp.port, { tlsPolicy: "pinned", pinnedCertSha256: sftp.hostKeySha256 }),
      { username: "210333617", password: "AdobeGeneratedPass!99" },
    );
    expect(pinnedRes).toEqual({ ok: true, serverCertSha256: sftp.hostKeySha256 });

    // 3. Wrong generated password returns auth failure and never echoes credentials
    const badAuth = await testBridgeFtps(
      h.url,
      makeAdobePreset(sftp.port, { tlsPolicy: "pinned", pinnedCertSha256: sftp.hostKeySha256 }),
      { username: "210333617", password: "WrongGeneratedPassword!" },
    );
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) {
      expect(badAuth.code).toBe("auth");
      expect(badAuth.reason).not.toContain("WrongGeneratedPassword!");
      expect(badAuth.reason).not.toContain("210333617");
    }
  });

  it("uploads standalone SVG + multi-chunk EPS over one pooled SFTP session without logging filenames or IDs", async () => {
    const h = await startHelper();
    const sftp = await startFakeSftpServer({ username: "210333617", password: "AdobeGeneratedPass!99" });
    liveSftp.push(sftp);

    const preset = makeAdobePreset(sftp.port, {
      tlsPolicy: "pinned",
      pinnedCertSha256: sftp.hostKeySha256,
    });
    const creds = { username: "210333617", password: "AdobeGeneratedPass!99" };
    const sessionKey = "adobe-batch-1";

    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"/>');
    const epsBytes = new Uint8Array(60_000);
    for (let i = 0; i < epsBytes.length; i += 1) epsBytes[i] = (i * 31 + 7) & 0xff;

    const r1 = await uploadBridgeFtps({
      bridgeUrl: h.url, preset, creds, fileName: "icon_01.svg", bytes: svgBytes, sessionKey,
    });
    const r2 = await uploadBridgeFtps({
      bridgeUrl: h.url, preset, creds, fileName: "icon_01.eps", bytes: epsBytes, sessionKey,
    });
    await closeBridgeFtpsSession(h.url, sessionKey);

    expect(r1).toEqual({ ok: true, bytes: svgBytes.byteLength });
    expect(r2).toEqual({ ok: true, bytes: epsBytes.byteLength });
    expect(sftp.getLogins()).toBe(1);
    expect(new Uint8Array(sftp.uploaded.get("/icon_01.svg")!)).toEqual(svgBytes);
    expect(new Uint8Array(sftp.uploaded.get("/icon_01.eps")!)).toEqual(epsBytes);

    const combinedLog = h.log.join("\n");
    expect(combinedLog).not.toContain("icon_01.svg");
    expect(combinedLog).not.toContain("icon_01.eps");
    expect(combinedLog).not.toContain("210333617");
    expect(combinedLog).not.toContain("AdobeGeneratedPass!99");
  });
});
