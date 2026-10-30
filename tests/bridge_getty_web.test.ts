// @vitest-environment node
// The loopback helper's Getty web routes: capability reporting, request
// validation (Getty hosts only, JPEG/EPS only, credentials required) and the
// honest failure when this machine has no Chrome/Edge to launch. No live Getty
// account or browser is involved.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findBrowser, parseCdpEndpoint, resolveProfileDir } from "../tools/bridge/gettyweb/browser.mjs";
import { contributeUrlOf, failurePayload, iconsFromBody, iconsFromConfig, mayReleaseSession } from "../tools/bridge/gettyweb/routes.mjs";
import { ownFailures, resetBatchState, safeStagedName, uploadTimeoutFor } from "../tools/bridge/gettyweb/session.mjs";
import { GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";

const SERVER = path.resolve("tools/bridge/server.mjs");
const NO_BROWSER = "/nonexistent/getty-web-browser";

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const live: Helper[] = [];

async function startHelper(extraArgs: string[] = []): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "getty-web-bridge-test-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0", ...extraArgs], {
    env: { ...process.env, INKSCAPE_PATH: "/nonexistent/inkscape", BRIDGE_TMP: tmp, GETTY_WEB_BROWSER: NO_BROWSER },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log: string[] = [];
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`helper timeout:\n${log.join("\n")}`)), 8000);
    const onChunk = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim() === "") continue;
        log.push(line);
        const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(line);
        if (match !== null) { clearTimeout(timer); resolve(match[1]); }
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
  const helper = { url, child, log, tmp };
  live.push(helper);
  return helper;
}

/** Runs the helper's own one-command browser self-check and returns its log. */
async function runGettyCheck(
  env: Record<string, string | undefined> = {},
  flags: string[] = ["--getty-check"],
): Promise<{ code: number | null; log: string }> {
  const child = spawn(process.execPath, [SERVER, ...flags], {
    env: { ...process.env, INKSCAPE_PATH: "/nonexistent/inkscape", GETTY_WEB_BROWSER: NO_BROWSER, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { code, log: log.join("") };
}

afterEach(async () => {
  for (const helper of live.splice(0)) {
    helper.child.kill();
    await new Promise((resolve) => helper.child.once("exit", resolve));
    rmSync(helper.tmp, { recursive: true, force: true });
  }
});

function configHeader(config: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(config), "utf8").toString("base64");
}

function gettyConfig(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...GETTY_WEB_PRESET, username: "contributor@example.com", password: "GettyPass!42", ...patch };
}

async function postConfig(url: string, route: string, config: Record<string, unknown>, body?: Uint8Array): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${url}${route}`, {
    method: "POST", headers: { "x-getty-web-config": configHeader(config) }, body: body as BodyInit | undefined,
  });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

describe("Getty web browser self-check", () => {
  it("exits non-zero and names the missing browser when none is installed", async () => {
    const check = await runGettyCheck();
    expect(check.code).toBe(1);
    expect(check.log).toContain("NOT FOUND");
    expect(check.log).toContain("GETTY_WEB_BROWSER");
    expect(check.log).not.toContain("listening on");
  });

  it("resets a stuck Getty profile folder by itself, with no window to close", async () => {
    const profile = mkdtempSync(path.join(tmpdir(), "getty-web-reset-test-"));
    writeFileSync(path.join(profile, "SingletonLock"), "host-4242");
    writeFileSync(path.join(profile, "DevToolsActivePort"), "61111\n/devtools/browser/dead\n");
    try {
      const check = await runGettyCheck({ GETTY_WEB_PROFILE: profile }, ["--getty-reset"]);
      expect(check.code).toBe(0);
      expect(check.log).toContain("reset:");
      expect(existsSync(path.join(profile, "SingletonLock"))).toBe(false);
      expect(existsSync(path.join(profile, "DevToolsActivePort"))).toBe(false);
      expect(check.log).not.toContain("listening on");
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });

  it("asks for a profile folder before resetting anything", async () => {
    const check = await runGettyCheck({ GETTY_WEB_PROFILE: "" }, ["--getty-reset"]);
    expect(check.code).toBe(1);
    expect(check.log).toContain("--getty-profile");
  });

  it("reports a browser that never opens a usable DevTools port instead of hanging", async () => {
    const check = await runGettyCheck({ GETTY_WEB_BROWSER: process.execPath });
    expect(check.code).toBe(1);
    expect(check.log).toContain("did not open a usable DevTools port");
    expect(check.log).toContain("GETTY_WEB_CDP");
  });
});

describe("Getty web helper routes", () => {
  it("advertises the Getty web capability and the missing browser in /health", async () => {
    const helper = await startHelper();
    const body = await (await fetch(`${helper.url}/health`)).json() as { gettyWeb?: Record<string, unknown> };
    expect(body.gettyWeb).toMatchObject({ ready: true, browser: "missing" });
  });

  it("opens a visible browser window when the helper starts with --getty-headed", async () => {
    const helper = await startHelper(["--getty-headed"]);
    const body = await (await fetch(`${helper.url}/health`)).json() as { gettyWeb?: Record<string, unknown> };
    expect(body.gettyWeb).toMatchObject({ ready: true, headed: true });
    expect(helper.log.join("\n")).toContain("VISIBLE window");
  });

  it("refuses a non-Getty host, foreign protocols and missing credentials before launching anything", async () => {
    const helper = await startHelper();
    const privateHost = await postConfig(helper.url, "/getty-web/upload", gettyConfig({ host: "169.254.169.254" }));
    expect(privateHost.status).toBe(400);
    expect(String(privateHost.json.reason)).toContain("gettyimages.com");

    const wrongProtocol = await postConfig(helper.url, "/getty-web/upload", gettyConfig({ protocol: "ftps-explicit" }));
    expect(wrongProtocol.status).toBe(400);

    const noCreds = await postConfig(helper.url, "/getty-web/upload", gettyConfig({ username: "", password: "" }));
    expect(noCreds.status).toBe(400);
    expect(String(noCreds.json.reason)).toContain("e-mail and password");
  });

  it("rejects a body that is not one JPEG plus an optional EPS", async () => {
    const helper = await startHelper();
    const config = gettyConfig({ files: [{ name: "sheet.png", bytes: 4 }] });
    const res = await postConfig(helper.url, "/getty-web/upload", config, new Uint8Array(Buffer.from("PNG!")));
    expect(res.status).toBe(400);
    expect(String(res.json.reason)).toContain("JPEG");
  });

  it("answers 503 with a browser hint when no Chrome/Edge exists on the machine", async () => {
    const helper = await startHelper();
    const config = gettyConfig({ files: [{ name: "icon_a.jpeg", bytes: 3 }] });
    const upload = await postConfig(helper.url, "/getty-web/upload", config, new Uint8Array([1, 2, 3]));
    expect(upload.status).toBe(503);
    expect(upload.json).toMatchObject({ ok: false, code: "browser" });
    expect(String(upload.json.reason)).toContain("Chrome");

    const tested = await fetch(`${helper.url}/getty-web/test`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: configHeader(gettyConfig()),
    }).then(async (res) => ({ status: res.status, json: await res.json() }));
    expect(tested.status).toBe(503);
  });

  it("has no progress to report for a run that is not uploading", async () => {
    const helper = await startHelper();
    const res = await fetch(`${helper.url}/getty-web/progress?sessionKey=run-1`);
    expect(res.status).toBe(404);
    const body = await res.json() as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toContain("no Getty upload is running");
  });

  it("refuses to finish a batch it never opened, instead of launching a browser", async () => {
    const helper = await startHelper();
    const res = await fetch(`${helper.url}/getty-web/finish`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: configHeader(gettyConfig()),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { ok: boolean; code: string; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toContain("upload at least one icon first");
    expect(helper.log.join("\n")).not.toContain("GettyPass!42");
  });

  it("closes pooled sessions without touching credentials", async () => {
    const helper = await startHelper();
    const res = await fetch(`${helper.url}/getty-web/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionKey: "run-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const logged = helper.log.join("\n");
    expect(logged).not.toContain("GettyPass!42");
    expect(logged).not.toContain("contributor@example.com");
  });
});

describe("Getty web pure route helpers", () => {
  it("treats an explicit profile folder as reusable and an empty one as throwaway", () => {
    expect(resolveProfileDir("")).toBeNull();
    expect(resolveProfileDir("   ")).toBeNull();
    expect(resolveProfileDir(undefined)).toBeNull();
    expect(resolveProfileDir("/tmp/getty-profile")).toBe(path.resolve("/tmp/getty-profile"));
  });

  it("builds only https Getty contributor URLs and refuses path escapes", () => {
    expect(contributeUrlOf(GETTY_WEB_PRESET)).toBe("https://esp.gettyimages.com/contribute");
    expect(contributeUrlOf({ ...GETTY_WEB_PRESET, host: "evil.example.com" })).toBeNull();
    expect(contributeUrlOf({ ...GETTY_WEB_PRESET, host: "gettyimages.com.evil.test" })).toBeNull();
    expect(contributeUrlOf({ ...GETTY_WEB_PRESET, remoteDir: "/contribute/../../etc" })).toBeNull();
    expect(contributeUrlOf({ ...GETTY_WEB_PRESET, remoteDir: "contribute" })).toBeNull();
  });

  it("splits the concatenated body by the declared file sizes", () => {
    const body = Buffer.from([1, 2, 3, 4, 5]);
    const cfg = { files: [{ name: "a.jpeg", bytes: 3 }, { name: "a.eps", bytes: 2 }] };
    const [icon] = iconsFromBody(body, cfg) ?? [];
    expect(icon?.files.map((f) => [f.name, [...f.bytes]])).toEqual([["a.jpeg", [1, 2, 3]], ["a.eps", [4, 5]]]);
    expect(iconsFromBody(body, { files: [{ name: "a.jpeg", bytes: 4 }, { name: "a.eps", bytes: 4 }] })).toBeNull();
    expect(iconsFromBody(body, { files: [{ name: "a.zip", bytes: 5 }] })).toBeNull();
    expect(iconsFromBody(body, { files: [] })).toBeNull();
  });

  it("takes every icon of the run from one body, keeping each icon's files together", () => {
    const body = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const cfg = {
      icons: [
        { files: [{ name: "a.jpeg", bytes: 2 }, { name: "a.eps", bytes: 1 }], metadata: { title: "A", keywords: [] } },
        { files: [{ name: "b.jpeg", bytes: 6 }], metadata: null },
      ],
    };
    const icons = iconsFromBody(body, cfg);
    expect(icons?.map((icon) => icon.files.map((f) => [f.name, [...f.bytes]]))).toEqual([
      [["a.jpeg", [1, 2]], ["a.eps", [3]]],
      [["b.jpeg", [4, 5, 6, 7, 8, 9]]],
    ]);
    expect(icons?.[0].metadata).toMatchObject({ title: "A" });
    expect(icons?.[1].metadata).toBeNull();
    // A body that does not add up, or an icon without files, is refused.
    expect(iconsFromBody(body, { icons: [{ files: [{ name: "a.jpeg", bytes: 2 }] }, { files: [] }] })).toBeNull();
    expect(iconsFromBody(body, { icons: [{ files: [{ name: "a.jpeg", bytes: 3 }, { name: "a.eps", bytes: 1 }, { name: "c.eps", bytes: 1 }] }] })).toBeNull();
    expect(iconsFromBody(body, { icons: [] })).toBeNull();
  });

  it("gives a longer wait to a run that sends several pairs at once", () => {
    expect(uploadTimeoutFor(2)).toBe(180000);
    expect(uploadTimeoutFor(4)).toBe(240000);
    expect(uploadTimeoutFor(6, 60000)).toBe(180000);
  });

  it("keeps the staged file name and strips any path segment", () => {
    expect(safeStagedName("/home/user/export/icon_a.jpeg")).toBe("icon_a.jpeg");
    expect(safeStagedName("..\\..\\windows\\icon a.eps")).toBe("icon_a.eps");
    expect(safeStagedName("")).toBe("icon.bin");
    expect(safeStagedName("..")).toBe("icon.bin");
  });

  it("accepts only loopback DevTools endpoints", () => {
    expect(parseCdpEndpoint("http://127.0.0.1:9222")?.port).toBe("9222");
    expect(parseCdpEndpoint("ws://localhost:9222/devtools/browser/x")?.hostname).toBe("localhost");
    expect(parseCdpEndpoint("http://10.0.0.5:9222")).toBeNull();
    expect(parseCdpEndpoint("not a url")).toBeNull();
  });

  it("reports the configured browser override when it does not exist", () => {
    const found = findBrowser({ GETTY_WEB_BROWSER: NO_BROWSER, PATH: "" });
    expect(found.found).toBe(false);
    if (!found.found) expect(found.fix).toContain("GETTY_WEB_CDP");
  });
});

// Getty takes 100 uploads per batch and a JPEG + EPS pair counts once, so the
// helper must count icons — not allow 200 icons / 400 files in one request.
describe("Getty web batch limits in the helper", () => {
  const icon = (i: number, withEps: boolean) => ({
    files: withEps
      ? [{ name: `icon_${i}.jpeg`, bytes: 1 }, { name: `icon_${i}.eps`, bytes: 1 }]
      : [{ name: `icon_${i}.jpeg`, bytes: 1 }],
  });
  const configOf = (count: number, withEps = false) => ({
    icons: Array.from({ length: count }, (_v, i) => icon(i, withEps)),
  });

  it("accepts one batch's 100 uploads and refuses the 101st", () => {
    expect(iconsFromConfig(configOf(100))).not.toBeNull();
    expect(iconsFromConfig(configOf(101))).toBeNull();
    // 100 pairs are 100 uploads / 200 physical files: still one batch.
    const pairs = iconsFromConfig(configOf(100, true));
    expect(pairs).toHaveLength(100);
    expect(pairs?.[0].files).toHaveLength(2);
    expect(iconsFromConfig(configOf(101, true))).toBeNull();
  });

  it("reports what a failed batch had already accepted, without a secret", () => {
    const cfg = { username: "contributor@example.com", password: "GettyPass!42" };
    const payload = failurePayload({
      code: "timeout",
      reason: "the page stopped after GettyPass!42 was typed",
      state: { uploaded: ["icon_1.jpeg"], failures: [{ name: "icon_2.eps", id: "FSPID9" }], namesSeen: ["icon_1.jpeg", "icon_2.eps"] },
    }, cfg);
    expect(payload).toMatchObject({
      ok: false, code: "timeout",
      accepted: ["icon_1.jpeg"], failed: [{ name: "icon_2.eps", id: "FSPID9" }],
      seen: ["icon_1.jpeg", "icon_2.eps"],
    });
    expect(payload.reason).not.toContain("GettyPass!42");
    // A failure with no page reading claims nothing.
    expect(failurePayload(null, cfg)).toMatchObject({ ok: false, code: "page", accepted: [], failed: [], seen: [] });
  });

  it("starts the next batch from a clean slate, keeping only the browser", () => {
    // Batch 1's id, names and counts belong to batch 1: `finish` refuses while a
    // card of *its* batch is missing, so a stale name would block batch 2.
    const state = { batchId: "68445204", expected: ["icon_1.jpeg"], progress: { phase: "done" }, reloads: 2 };
    expect(resetBatchState(state)).toEqual({ batchId: null, expected: [], progress: null, reloads: 0 });
  });

  it("only hands a request its own Upload failed cards", () => {
    // A batch sent in parts keeps the earlier parts' cards on the page. Their
    // rejections belong to another request: they must not stop this part from
    // typing its own metadata (and would otherwise fail every later part).
    const failed = [{ name: "star_01.eps", id: "FSPID51446" }, { name: "moon_02.eps", id: null }];
    expect(ownFailures(failed, [{ name: "moon_02.jpg" }, { name: "moon_02.eps" }]))
      .toEqual([{ name: "moon_02.eps", id: null }]);
    expect(ownFailures(failed, [{ name: "sun_03.jpg" }])).toEqual([]);
    expect(ownFailures(undefined, [{ name: "star_01.jpg" }])).toEqual([]);
  });

  it("never sweeps a session that has a request in flight", () => {
    // A 100-icon batch outlives the five idle minutes; closing it mid-batch would
    // lose the run.
    expect(mayReleaseSession({ busy: true })).toBe(false);
    expect(mayReleaseSession({ busy: false })).toBe(true);
    expect(mayReleaseSession(undefined)).toBe(true);
  });
});
