// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeBridgeFtpsSession, probeBridgeFtps, testBridgeFtps, uploadBridgeFtps } from "../src/lib/stockupload/bridgeclient";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
import { FAKE_FTPS_CERT_SHA256, startFakeFtpsServer } from "./helpers/fakeftps.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const liveHelpers: Helper[] = [];
const liveFtps: { close: () => Promise<void> }[] = [];

async function startHelper(): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "bridge-ftps-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0"], {
    env: { ...process.env, BRIDGE_TMP: tmp }, stdio: ["ignore", "pipe", "pipe"],
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
  for (const s of liveFtps.splice(0)) await s.close();
});

function makePreset(port: number, patch: Partial<StockFtpPreset> = {}): StockFtpPreset {
  return {
    id: "shutterstock",
    name: "Shutterstock",
    template: "shutterstock",
    protocol: "ftps-explicit",
    host: "127.0.0.1",
    port,
    remoteDir: "/",
    passive: true,
    tlsPolicy: "strict",
    pinnedCertSha256: "",
    timeoutMs: 10000,
    ...patch,
  };
}

describe("local loopback Explicit FTPS bridge", () => {
  it("reports ftps.ready=true on /health even without Inkscape and blocks foreign origins", async () => {
    const h = await startHelper();
    const probe = await probeBridgeFtps(h.url);
    expect(probe).toEqual({ ok: true });
    expect(h.log.join("\n")).toContain("FTPS upload helper: READY");

    const blocked = await fetch(`${h.url}/ftps/test`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(blocked.status).toBe(403);

    const rootPage = await fetch(`${h.url}/`);
    expect(rootPage.headers.get("cache-control")).toBe("no-store");
  });

  it("surfaces untrusted server cert SHA-256 under strict TLS, succeeds when pinned, and rejects bad passwords", async () => {
    const h = await startHelper();
    const ftps = await startFakeFtpsServer({ username: "artist@ss.test", password: "TopSecretPassword!" });
    liveFtps.push(ftps);

    // 1. Strict CA rejects self-signed cert and returns exact SHA-256 fingerprint for user confirmation
    const strictRes = await testBridgeFtps(h.url, makePreset(ftps.port), {
      username: "artist@ss.test", password: "TopSecretPassword!",
    });
    expect(strictRes.ok).toBe(false);
    if (!strictRes.ok) {
      expect(strictRes.code).toBe("cert");
      expect(strictRes.serverCertSha256).toBe(FAKE_FTPS_CERT_SHA256);
    }

    // 2. Pinned SHA-256 succeeds
    const pinnedPreset = makePreset(ftps.port, { tlsPolicy: "pinned", pinnedCertSha256: FAKE_FTPS_CERT_SHA256 });
    const okRes = await testBridgeFtps(h.url, pinnedPreset, {
      username: "artist@ss.test", password: "TopSecretPassword!",
    });
    expect(okRes).toEqual({ ok: true, serverCertSha256: FAKE_FTPS_CERT_SHA256 });

    // 3. Wrong password returns auth failure and never logs credentials
    const badAuth = await testBridgeFtps(h.url, pinnedPreset, {
      username: "artist@ss.test", password: "WrongPassword99",
    });
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) expect(badAuth.code).toBe("auth");

    const combinedLog = h.log.join("\n");
    expect(combinedLog).not.toContain("artist@ss.test");
    expect(combinedLog).not.toContain("TopSecretPassword!");
    expect(combinedLog).not.toContain("WrongPassword99");
  });

  it("uploads multiple representations (JPG + EPS + ZIP) reusing one FTPS session and never logs filenames", async () => {
    const h = await startHelper();
    const ftps = await startFakeFtpsServer({ username: "artist@ss.test", password: "TopSecretPassword!" });
    liveFtps.push(ftps);
    const preset = makePreset(ftps.port, { tlsPolicy: "pinned", pinnedCertSha256: FAKE_FTPS_CERT_SHA256 });
    const creds = { username: "artist@ss.test", password: "TopSecretPassword!" };
    const sessionKey = "batch-run-1";

    const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    const epsBytes = new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EOF\n");

    const r1 = await uploadBridgeFtps({
      bridgeUrl: h.url, preset, creds, fileName: "icon_01.jpg", bytes: jpgBytes, sessionKey,
    });
    const r2 = await uploadBridgeFtps({
      bridgeUrl: h.url, preset, creds, fileName: "icon_01.eps", bytes: epsBytes, sessionKey,
    });
    await closeBridgeFtpsSession(h.url, sessionKey);

    expect(r1).toEqual({ ok: true, bytes: jpgBytes.byteLength });
    expect(r2).toEqual({ ok: true, bytes: epsBytes.byteLength });
    expect(ftps.getLogins()).toBe(1);
    expect(new Uint8Array(ftps.uploaded.get("/icon_01.jpg")!)).toEqual(jpgBytes);
    expect(new Uint8Array(ftps.uploaded.get("/icon_01.eps")!)).toEqual(epsBytes);

    const combinedLog = h.log.join("\n");
    expect(combinedLog).not.toContain("icon_01.jpg");
    expect(combinedLog).not.toContain("icon_01.eps");
    expect(combinedLog).not.toContain("artist@ss.test");
  });
});
