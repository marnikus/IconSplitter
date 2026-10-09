// @vitest-environment node
// bridge_inkscape.test.ts — the Inkscape helper process (`tools/bridge/`,
// 2026-10-09, design D2), spawned for real on an ephemeral port with a FAKE
// Inkscape (tests/helpers/fakeinkscape.mjs). What the browser client relies
// on: /health names found + version (live, not cached at start), /convert/eps
// answers EPS text + the version header or an honest JSON reason — never a
// half file — the temp folder is gone afterwards, the body limit, the
// loopback-only CORS/PNA answers, and `/` serving dist when present.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyEpsDocument } from "../src/lib/upload/eps";

const SERVER = path.resolve("tools/bridge/server.mjs");
const FAKE = path.resolve("tests/helpers/fakeinkscape.mjs");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect width="70" height="70"/></svg>';

interface Helper { url: string; child: ChildProcess; log: string[]; tmp: string }
const live: Helper[] = [];

/** Spawns the real server on port 0 with the given env; resolves when it says where it listens. */
async function startHelper(env: Record<string, string> = {}, extraArgs: string[] = []): Promise<Helper> {
  const tmp = mkdtempSync(path.join(tmpdir(), "bridge-test-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0", ...extraArgs], {
    env: { ...process.env, INKSCAPE_PATH: FAKE, BRIDGE_TMP: tmp, ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  const log: string[] = [];
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`helper did not start:\n${log.join("\n")}`)), 8000);
    const onLine = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim() === "") continue;
        log.push(line);
        const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(line);
        if (m !== null) { clearTimeout(timer); resolve(m[1]); }
      }
    };
    child.stdout?.on("data", onLine);
    child.stderr?.on("data", onLine);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`helper exited ${code}:\n${log.join("\n")}`)); });
  });
  const h = { url, child, log, tmp };
  live.push(h);
  return h;
}

afterEach(async () => {
  for (const h of live.splice(0)) {
    h.child.kill();
    await new Promise((r) => h.child.once("exit", r));
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

const post = (url: string, body: string, init: RequestInit = {}) => fetch(`${url}/convert/eps`, {
  method: "POST", body, headers: { "content-type": "image/svg+xml", ...(init.headers ?? {}) }, ...init,
});

describe("the Inkscape helper", () => {
  it("binds loopback only and /health names the Inkscape it found, with its version", async () => {
    const h = await startHelper();
    expect(h.url.startsWith("http://127.0.0.1:")).toBe(true);
    const res = await fetch(`${h.url}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, inkscape: { found: true, version: "1.3.2", path: FAKE } });
    expect(typeof body.port).toBe("number");
  });

  it("without an Inkscape, /health is still 200 — found:false with the fix (a state, not a crash)", async () => {
    const h = await startHelper({ INKSCAPE_PATH: path.join(tmpdir(), "no-such-inkscape-here"), PATH: "" });
    const body = await (await fetch(`${h.url}/health`)).json();
    expect(body.ok).toBe(false);
    expect(body.inkscape.found).toBe(false);
    expect(body.inkscape.fix).toBe("install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH");
    expect((await post(h.url, SVG)).status).toBe(503);
  });

  it("POST /convert/eps answers the EPS text, the version header, and leaves no temp folder behind", async () => {
    const h = await startHelper();
    const res = await post(h.url, SVG);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/postscript");
    expect(res.headers.get("x-inkscape-version")).toBe("1.3.2");
    const eps = await res.text();
    expect(verifyEpsDocument(eps)).toMatchObject({ ok: true, boundingBox: { urx: 70, ury: 70 } });
    expect(readdirSync(h.tmp)).toEqual([]); // the per-conversion folder is deleted in `finally`
    expect(h.log.join("\n")).not.toContain("<rect"); // RULE 20: method/status/bytes are logged, never content
  });

  it("an Inkscape that exits non-zero → 502 with its reason; a hang → 504 within the timeout; both clean up", async () => {
    const failing = await startHelper({ FAKE_INKSCAPE_MODE: "fail" });
    const bad = await post(failing.url, SVG);
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ reason: "Inkscape exited with code 1: ** (inkscape:1): CRITICAL **: fake failure" });
    expect(readdirSync(failing.tmp)).toEqual([]);

    const slow = await startHelper({ FAKE_INKSCAPE_MODE: "slow", BRIDGE_TIMEOUT_MS: "300" });
    const t0 = Date.now();
    const hung = await post(slow.url, SVG);
    expect(hung.status).toBe(504);
    expect(await hung.json()).toEqual({ reason: "Inkscape did not finish within 0.3 s — the file was killed, nothing was written" });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(readdirSync(slow.tmp)).toEqual([]);
  });

  it("a cancelled request kills the running Inkscape at once (RULE 7) — no 60 s zombie", async () => {
    const slow = await startHelper({ FAKE_INKSCAPE_MODE: "slow", BRIDGE_TIMEOUT_MS: "20000" });
    const ctl = new AbortController();
    const pending = post(slow.url, SVG, { signal: ctl.signal }).catch((e: Error) => e.name);
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    ctl.abort();
    expect(await pending).toBe("AbortError");
    const start = Date.now();
    while (!slow.log.some((l) => l.includes("→ 499")) && Date.now() - start < 4000) await new Promise((r) => setTimeout(r, 25));
    expect(slow.log.some((l) => l.includes("→ 499"))).toBe(true);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(readdirSync(slow.tmp)).toEqual([]);
  });

  it("refuses what it must: an over-limit body (413), a non-SVG body (400), an unknown route (404)", async () => {
    const h = await startHelper({ BRIDGE_MAX_BYTES: "1000" });
    expect((await post(h.url, SVG + "<!--" + "x".repeat(2000) + "-->")).status).toBe(413);
    const notSvg = await post(h.url, "hello");
    expect(notSvg.status).toBe(400);
    expect((await notSvg.json()).reason).toContain("not an SVG");
    expect((await fetch(`${h.url}/nothing-here`)).status).toBe(404);
  });

  it("CORS + Private Network Access: a file:// page (Origin null) and localhost are allowed, anything else is not", async () => {
    const h = await startHelper();
    const preflight = (origin: string) => fetch(`${h.url}/convert/eps`, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-private-network": "true" },
    });
    const fromFile = await preflight("null");
    expect(fromFile.status).toBe(204);
    expect(fromFile.headers.get("access-control-allow-origin")).toBe("null");
    expect(fromFile.headers.get("access-control-allow-private-network")).toBe("true");
    expect(fromFile.headers.get("access-control-allow-headers")).toContain("content-type");
    const fromVite = await preflight("http://localhost:5173");
    expect(fromVite.status).toBe(204);
    expect(fromVite.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const evil = await preflight("https://evil.example");
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const evilGet = await fetch(`${h.url}/health`, { headers: { origin: "https://evil.example" } });
    expect(evilGet.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the built app from / when dist/index.html exists, and says so honestly when it does not", async () => {
    const dist = mkdtempSync(path.join(tmpdir(), "bridge-dist-"));
    try {
      const withDist = await startHelper({}, ["--dist", dist]);
      const missing = await fetch(`${withDist.url}/`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("npm run build");
      mkdirSync(dist, { recursive: true });
      writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Icon Splitter</title>");
      const page = await fetch(`${withDist.url}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("Icon Splitter");
      expect((await fetch(`${withDist.url}/../package.json`)).status).not.toBe(200); // no path escape
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
