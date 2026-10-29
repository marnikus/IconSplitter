// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
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
const ESP_CREDS = {
  username: "esp_contributor@example.com",
  password: "GettyEspPassword!42",
  apiKey: "GettyApiKeyId777",
  apiSecret: "GettyApiSecret888",
};

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const liveHelpers: Helper[] = [];
const liveEsp: FakeEspServer[] = [];

async function startHelper(): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "esp-bridge-test-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0"], {
    env: { ...process.env, INKSCAPE_PATH: "/nonexistent/inkscape", BRIDGE_TMP: tmp, BRIDGE_ESP_CHUNK_BYTES: "16" },
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

async function waitHelperLog(h: Helper, needle: string): Promise<boolean> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (h.log.join("\n").includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
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
  return { ...GETTY_IMAGES_PRESET, host: "127.0.0.1", port, timeoutMs: 10000, ...patch };
}

async function startEsp(patch: Partial<typeof ESP_CREDS & { failStage: "batch-list-403" | "ingest-422" }> = {}): Promise<FakeEspServer> {
  const esp = await startFakeEspServer({ ...ESP_CREDS, ...patch });
  liveEsp.push(esp);
  return esp;
}

describe("local loopback Getty ESP HTTPS bridge (real api.gettyimages.com/esp protocol)", () => {
  it("reports esp ready, surfaces untrusted TLS cert under strict, then connects via password grant + Token header when pinned", async () => {
    const h = await startHelper();
    const esp = await startEsp();

    expect(await probeBridgeFtps(h.url, globalThis.fetch, { requireEsp: true })).toEqual({ ok: true });

    const strictRes = await testBridgeFtps(h.url, makeGettyPreset(esp.port), ESP_CREDS);
    expect(strictRes.ok).toBe(false);
    if (!strictRes.ok) {
      expect(strictRes.code).toBe("cert");
      expect(strictRes.serverCertSha256).toBe(esp.certSha256);
    }

    const pinned = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });
    expect(await testBridgeFtps(h.url, pinned, ESP_CREDS)).toEqual({ ok: true, serverCertSha256: esp.certSha256 });

    // Real ESP surface proofs: password grant only, `Token token=` scheme (the fake 401s Bearer).
    expect(esp.state.tokenGrants).toEqual(["password"]);
    expect(esp.state.authHeaders.length).toBeGreaterThan(0);
    expect(esp.state.authHeaders.every((a) => a.startsWith("Token token="))).toBe(true);
  });

  it("refuses to fabricate a client_credentials login when the ESP API key/secret are missing (no token request is sent)", async () => {
    const h = await startHelper();
    const esp = await startEsp();
    const pinned = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });

    const res = await testBridgeFtps(h.url, pinned, { username: ESP_CREDS.username, password: ESP_CREDS.password });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("bad-request");
      expect(res.stage).toBe("esp-credentials");
      expect(res.reason).toContain("API Key");
      expect(res.reason).toContain("API Secret");
    }
    expect(esp.state.tokenRequests).toBe(0);
  });

  it("returns the FULL staged OAuth error (stage + HTTP status + error code) with every secret scrubbed, and mirrors it to the helper console", async () => {
    const h = await startHelper();
    const esp = await startEsp();
    const pinned = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });

    const badAuth = await testBridgeFtps(h.url, pinned, {
      username: ESP_CREDS.username, password: "WrongPassword#00", apiKey: ESP_CREDS.apiKey, apiSecret: "WrongSecret#11",
    });
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) {
      expect(badAuth.code).toBe("auth");
      expect(badAuth.stage).toBe("oauth-token");
      expect(badAuth.httpStatus).toBe(401);
      expect(badAuth.reason).toContain("oauth-token");
      expect(badAuth.reason).toContain("HTTP 401");
      expect(badAuth.reason).toContain("invalid_grant");
      for (const leak of [ESP_CREDS.username, "WrongPassword#00", ESP_CREDS.apiKey, "WrongSecret#11"]) {
        expect(badAuth.reason).not.toContain(leak);
      }
    }

    expect(await waitHelperLog(h, "[bridge]")).toBe(true);
    const consoleText = h.log.join("\n");
    expect(consoleText).toContain("oauth-token");
    expect(consoleText).toContain("401");
    for (const leak of [ESP_CREDS.username, "WrongPassword#00", ESP_CREDS.apiKey, "WrongSecret#11", ESP_CREDS.password]) {
      expect(consoleText).not.toContain(leak);
    }
  });

  it("distinguishes a valid token from a key without ESP submission access (batch list HTTP 403)", async () => {
    const h = await startHelper();
    const esp = await startEsp({ failStage: "batch-list-403" });
    const pinned = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });

    const res = await testBridgeFtps(h.url, pinned, ESP_CREDS);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("auth");
      expect(res.stage).toBe("esp-batch-list");
      expect(res.httpStatus).toBe(403);
      expect(res.reason).toContain("ESP submission access is not enabled for this API key");
    }
    expect(esp.state.tokenGrants).toEqual(["password"]); // token step itself succeeded
  });

  it("uploads a paired EPS+JPG as ONE ingestion contribution with SHA-256-authorized chunks, ETags and exact bytes", async () => {
    const h = await startHelper();
    const esp = await startEsp();
    const preset = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });
    const jpgBytes = new TextEncoder().encode("FAKE-RGB-JPEG-4075x4075");
    const epsBytes = new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n");
    const sessionKey = "getty-pair-run-1";
    const espPair = { epsFileName: "rocket_01.eps", rasterFileName: "rocket_01.jpg" };

    const upJpg = await uploadBridgeFtps({ bridgeUrl: h.url, preset, creds: ESP_CREDS, fileName: "rocket_01.jpg", bytes: jpgBytes, sessionKey, espPair });
    expect(upJpg).toEqual({ ok: true, bytes: jpgBytes.byteLength, espBatchId: "batch-901", espContributionId: "c-1" });

    const upEps = await uploadBridgeFtps({ bridgeUrl: h.url, preset, creds: ESP_CREDS, fileName: "rocket_01.eps", bytes: epsBytes, sessionKey, espPair });
    expect(upEps).toEqual({ ok: true, bytes: epsBytes.byteLength, espBatchId: "batch-901", espContributionId: "c-1" });

    await closeBridgeFtpsSession(h.url, sessionKey);

    expect(esp.state.tokenRequests).toBe(1);
    expect(esp.state.batchCreations).toBe(1);
    expect(esp.state.ingestInitiations).toHaveLength(1);
    expect(esp.state.ingestInitiations[0]).toMatchObject({
      submission_batch_id: "batch-901", file_name: "rocket_01.eps", raster_file_name: "rocket_01.jpg", upload_bucket: "oregon",
    });
    // 16-byte test chunks: jpg 23B -> 2 parts (raster), eps 31B -> 2 parts (file); each authorized by its SHA-256.
    expect(esp.state.authorizeRequests.map((a) => [a.rasterFile, a.partNumber])).toEqual([
      [true, 1], [true, 2], [false, 1], [false, 2],
    ]);
    const shaOf = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(esp.state.authorizeRequests[0].encryptedPayload).toBe(shaOf(jpgBytes.subarray(0, 16)));
    expect(esp.state.authorizeRequests[2].encryptedPayload).toBe(shaOf(epsBytes.subarray(0, 16)));
    expect(esp.state.completions.map((c) => c.rasterFile)).toEqual([true, false]);
    expect(esp.state.uploadedFiles.get("batch-901/rocket_01.jpg")?.toString("utf8")).toBe("FAKE-RGB-JPEG-4075x4075");
    expect(esp.state.uploadedFiles.get("batch-901/rocket_01.eps")?.toString("utf8")).toBe("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n");
  });

  it("surfaces the full ESP 422 validation errors from ingestion initiation", async () => {
    const h = await startHelper();
    const esp = await startEsp({ failStage: "ingest-422" });
    const preset = makeGettyPreset(esp.port, { tlsPolicy: "pinned", pinnedCertSha256: esp.certSha256 });

    const res = await uploadBridgeFtps({
      bridgeUrl: h.url, preset, creds: ESP_CREDS, fileName: "rocket_01.jpg",
      bytes: new TextEncoder().encode("FAKE-JPG"), sessionKey: "getty-422-run",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.stage).toBe("esp-ingest-initiate");
      expect(res.httpStatus).toBe(422);
      expect(res.reason).toContain("HTTP 422");
      expect(res.reason).toContain("file_name");
      expect(res.reason).toContain("is not valid for this submission batch type");
    }
  });
});
