// @vitest-environment node
// A `git pull` that changes the APP (not the helper) must still reach the page:
// the helper rebuilds `dist/` in place, the bundle stamp moves, and the open tab
// reloads itself onto it. Before this the helper watched only its own code, so a
// pull of app commits left the window serving the previous build until someone
// closed it by hand.
//
// Nothing here is a copy of the app's own state: the "build" is a tiny script that
// writes a stamped index.html, exactly like `npm run build` does.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { computeSrcFingerprint } from "../tools/bridge/distfresh.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");
const DISTFRESH = pathToFileURL(path.resolve("tools/bridge/distfresh.mjs")).href;

const temps: string[] = [];
const children: ChildProcess[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await new Promise((r) => (child.exitCode === null ? child.once("exit", r) : r(null)));
  }
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Sandbox {
  root: string;
  app: string;
  dist: string;
  helper: string;
  /** Set before the test makes the app look stale; the build script honours both. */
  buildOk: () => void;
}

/** A repo-shaped sandbox: app sources, a dist, the helper's dir and a stand-in build. */
function sandbox(): Sandbox {
  const root = tempDir("app-rebuild-");
  const app = path.join(root, "app");
  const dist = path.join(root, "dist");
  const helper = path.join(root, "helper");
  mkdirSync(app, { recursive: true });
  mkdirSync(dist, { recursive: true });
  mkdirSync(helper, { recursive: true });
  writeFileSync(path.join(app, "main.js"), "export const version = 1;\n");
  writeFileSync(path.join(helper, "routes.mjs"), "export const helper = 1;\n");
  const failFlag = path.join(root, "build-fails");
  // The stand-in build: stamps the fingerprint into the page, like `npm run build`.
  writeFileSync(path.join(root, "build.mjs"), [
    `import { existsSync, writeFileSync } from "node:fs";`,
    `import { computeSrcFingerprint } from ${JSON.stringify(DISTFRESH)};`,
    `if (existsSync(${JSON.stringify(failFlag)})) { console.error("stand-in build failed"); process.exit(1); }`,
    `const stamp = computeSrcFingerprint([${JSON.stringify(app)}]);`,
    // Like vite.config: the helper builds into ICONSPLITTER_OUT_DIR, then swaps it in.
    `writeFileSync((process.env.ICONSPLITTER_OUT_DIR || ${JSON.stringify(dist)}) + "/index.html",`,
    `  '<html><head><meta name="iconsplitter-src-hash" content="' + stamp + '"></head><body>app</body></html>');`,
    `console.log("stand-in build wrote the bundle");`,
  ].join("\n"));
  writeFreshDist(app, dist);
  return { root, app, dist, helper, buildOk: () => rmSync(failFlag, { force: true }) };
}

/** Writes a dist that matches the app right now, so nothing is stale at boot. */
function writeFreshDist(app: string, dist: string): void {
  const stamp = computeSrcFingerprint([app]);
  writeFileSync(path.join(dist, "index.html"),
    `<html><head><meta name="iconsplitter-src-hash" content="${stamp}"></head><body>app</body></html>`);
}

/** Resolves once the log shows `pattern`; rejects when it never does. */
function waitFor(log: string[], pattern: RegExp, limit = 15_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (pattern.test(log.join(""))) return resolve();
      if (Date.now() - started > limit) return reject(new Error(`helper timeout:\n${log.join("")}`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function listen(child: ChildProcess, log: string[]): ChildProcess {
  child.stdout?.on("data", (c) => log.push(c.toString()));
  child.stderr?.on("data", (c) => log.push(c.toString()));
  return child;
}

/** The helper on a random port, watching the sandbox's app dir and its own dir. */
function startHelper(box: Sandbox, log: string[]): ChildProcess {
  const child = spawn(process.execPath, [
    SERVER, "--port", "0",
    "--dist", box.dist,
    "--watch-dir", box.helper,
    "--app-dir", box.app,
    "--build-cmd", `node ${JSON.stringify(path.join(box.root, "build.mjs"))}`,
    "--build-cwd", box.root,
    "--update-check-ms", "120", "--update-quiet-ms", "200",
  ], {
    env: { ...process.env, BRIDGE_TMP: tempDir("app-rebuild-tmp-"), BRIDGE_NO_UPDATE_WATCH: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(listen(child, log));
  return child;
}

/** GET a helper path and return its JSON — the same call the open page makes. */
async function getHealth(child: ChildProcess, log: string[]): Promise<{ update?: { served?: { stamp?: string | null } } }> {
  const port = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(log.join(""))?.[1];
  if (port === undefined) throw new Error(`no port in the log:\n${log.join("")}`);
  expect(child.exitCode).toBeNull();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  return (await res.json()) as { update?: { served?: { stamp?: string | null } } };
}

describe("a pull that changes the app, not the helper", () => {
  it("rebuilds the bundle in place, so the open page gets a new stamp to reload onto", async () => {
    const box = sandbox();
    const log: string[] = [];
    const child = startHelper(box, log);
    await waitFor(log, /Update watch: ON/);
    await new Promise((r) => setTimeout(r, 300)); // let the baseline be taken
    expect(log.join("")).not.toMatch(/app source changed/);

    // The pull lands: only app code changed.
    writeFileSync(path.join(box.app, "main.js"), "export const version = 2;\n");
    await waitFor(log, /app source changed[\s\S]*rebuilding/i);
    await waitFor(log, /app bundle rebuilt/i);

    const stamp = computeSrcFingerprint([box.app]);
    expect(readFileSync(path.join(box.dist, "index.html"), "utf8")).toContain(`content="${stamp}"`);
    const health = await getHealth(child, log);
    expect(health.update?.served?.stamp).toBe(stamp);
    // The helper never restarts for app code: an upload in flight keeps its window.
    expect(child.exitCode).toBeNull();
  }, 30_000);

  it("says nothing when the app did not change", async () => {
    const box = sandbox();
    const log: string[] = [];
    startHelper(box, log);
    await waitFor(log, /Update watch: ON/);
    await new Promise((r) => setTimeout(r, 600));
    expect(log.join("")).not.toMatch(/rebuilding/i);
    // A stale dist is still rebuilt the moment the page asks for it (serveDist).
    expect(readFileSync(path.join(box.dist, "index.html"), "utf8")).toContain("iconsplitter-src-hash");
  }, 30_000);

  it("reports a failed build and keeps serving the previous bundle", async () => {
    const box = sandbox();
    const before = readFileSync(path.join(box.dist, "index.html"), "utf8");
    writeFileSync(path.join(box.root, "build-fails"), "1");
    const log: string[] = [];
    const child = startHelper(box, log);
    await waitFor(log, /Update watch: ON/);
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(path.join(box.app, "main.js"), "export const version = 3;\n");
    await waitFor(log, /rebuild failed/i);
    expect(readFileSync(path.join(box.dist, "index.html"), "utf8")).toBe(before);
    const health = await getHealth(child, log);
    expect(health.update?.served?.stamp).not.toBeNull();
    expect(child.exitCode).toBeNull();
  }, 30_000);
});
