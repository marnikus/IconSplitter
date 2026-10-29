// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeBridgeFtpsSession,
  probeBridgeFtps,
  testBridgeFtps,
  uploadBridgeFtps,
} from "../src/lib/stockupload/bridgeclient";
import { GETTY_IMAGES_PRESET } from "../src/lib/stockupload/presets";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
import { startFakeEspServer, type FakeEspServer } from "./helpers/fakeesp.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const liveHelpers: Helper[] = [];
const liveEsp: FakeEspServer[] = [];

async function startHelper(): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "esp-bridge-test-"));
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
  for (const s of liveEsp.splice(0)) await s.close();
});

function makeGettyPreset(port: number, patch: Partial<StockFtpPreset> = {}): StockFtpPreset {
  return {
    ...GETTY_IMAGES_PRESET,
    host: "127.0.0.1",
    port,
    timeoutMs: 10000,
    ...patch,
  };
}

describe("local loopback Getty ESP HTTPS bridge (api.gettyimages.com:443 protocol)", () => {
  it("reports esp ready in /health, surfaces untrusted TLS cert SHA-256 under strict policy, succeeds when pinned, and scrubs all 4 secrets on 401", async () => {
    const h = await startHelper();
    const esp = await startFakeEspServer({
      username: "esp_contributor@example.com",
      password: "GettyEspPassword!42",
      apiKey: "GettyApiKeyId777",
      apiSecret: "GettyApiSecret888",
    });
    liveEsp.push(esp);

    const probe = await probeBridgeFtps(h.url, globalThis.fetch, { requireEsp: true });
    expect(probe).toEqual({ ok: true });

    // 1. Strict TLS rejects self-signed cert and returns exact SHA-256 for Trust & Pin
    const strictRes = await testBridgeFtps(h.url, makeGettyPreset(esp.port), {
      username: "esp_contributor@example.com",
      password: "GettyEspPassword!42",
      apiKey: "GettyApiKeyId777",
      apiSecret: "GettyApiSecret888",
    });
    expect(strictRes.ok).toBe(false);
    if (!strictRes.ok) {
      expect(strictRes.code).toBe("cert");
      expect(strictRes.serverCertSha256).toBe(esp.certSha256);
    }

    // 2. Pinned TLS SHA-256 exchanges OAuth2 token and verifies GET /esp/submission/v1/submission_batches
    const pinnedPreset = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });
    const pinnedRes = await testBridgeFtps(h.url, pinnedPreset, {
      username: "esp_contributor@example.com",
      password: "GettyEspPassword!42",
      apiKey: "GettyApiKeyId777",
      apiSecret: "GettyApiSecret888",
    });
    expect(pinnedRes).toEqual({ ok: true, serverCertSha256: esp.certSha256 });

    // 3. Invalid credentials return auth error with all 4 secrets scrubbed
    const badAuth = await testBridgeFtps(h.url, pinnedPreset, {
      username: "esp_contributor@example.com",
      password: "WrongPassword#00",
      apiKey: "GettyApiKeyId777",
      apiSecret: "WrongSecret#11",
    });
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) {
      expect(badAuth.code).toBe("auth");
      for (const leak of ["esp_contributor@example.com", "WrongPassword#00", "GettyApiKeyId777", "WrongSecret#11"]) {
        expect(badAuth.reason).not.toContain(leak);
      }
    }
  });

  it("reuses one Getty ESP submission batch across a pooled EPS + JPG pair upload and writes exact binary payloads", async () => {
    const h = await startHelper();
    const esp = await startFakeEspServer({
      username: "esp_contributor@example.com",
      password: "GettyEspPassword!42",
      apiKey: "GettyApiKeyId777",
      apiSecret: "GettyApiSecret888",
    });
    liveEsp.push(esp);

    const preset = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });
    const creds = {
      username: "esp_contributor@example.com",
      password: "GettyEspPassword!42",
      apiKey: "GettyApiKeyId777",
      apiSecret: "GettyApiSecret888",
    };
    const jpgBytes = new TextEncoder().encode("FAKE-RGB-JPEG-4075x4075");
    const epsBytes = new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n");
    const sessionKey = "getty-pair-run-1";

    const upJpg = await uploadBridgeFtps({
      bridgeUrl: h.url,
      preset,
      creds,
      fileName: "rocket_01.jpg",
      bytes: jpgBytes,
      sessionKey,
    });
    expect(upJpg).toEqual({ ok: true, bytes: jpgBytes.byteLength });

    const upEps = await uploadBridgeFtps({
      bridgeUrl: h.url,
      preset,
      creds,
      fileName: "rocket_01.eps",
      bytes: epsBytes,
      sessionKey,
    });
    expect(upEps).toEqual({ ok: true, bytes: epsBytes.byteLength });

    await closeBridgeFtpsSession(h.url, sessionKey);

    expect(esp.state.tokenRequests).toBe(1);
    expect(esp.state.batchCreations).toBe(1);
    expect(esp.state.contributions).toHaveLength(2);
    expect(esp.state.uploadedFiles.get("batch-901/rocket_01.jpg")?.toString("utf8")).toBe("FAKE-RGB-JPEG-4075x4075");
    expect(esp.state.uploadedFiles.get("batch-901/rocket_01.eps")?.toString("utf8")).toBe("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n");
  });
});
