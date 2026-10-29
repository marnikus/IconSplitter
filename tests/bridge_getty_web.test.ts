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
import { contributeUrlOf, filesFromBody } from "../tools/bridge/gettyweb/routes.mjs";
import { safeStagedName } from "../tools/bridge/gettyweb/session.mjs";
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
    const files = filesFromBody(body, cfg);
    expect(files?.map((f) => [f.name, [...f.bytes]])).toEqual([["a.jpeg", [1, 2, 3]], ["a.eps", [4, 5]]]);
    expect(filesFromBody(body, { files: [{ name: "a.jpeg", bytes: 4 }, { name: "a.eps", bytes: 4 }] })).toBeNull();
    expect(filesFromBody(body, { files: [{ name: "a.zip", bytes: 5 }] })).toBeNull();
    expect(filesFromBody(body, { files: [] })).toBeNull();
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
