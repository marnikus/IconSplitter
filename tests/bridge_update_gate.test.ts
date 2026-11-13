// @vitest-environment node
// The helper updates itself from COMMITTED, settled code only (2026-11-13).
// It used to rebuild the app and restart itself from whatever bytes were on
// disk every 10 s — a half-written edit, a pull still writing files — so an
// import of a file that did not exist yet broke the build and a broken helper
// crash-looped. Now: the watched files must be quiet for a while and committed
// (no uncommitted or untracked change, no git operation running); the bundle is
// built into a staging folder and swapped in only when it is complete and
// stamped for the sources it was built from; new helper code must load in a
// self-test before the running helper hands over.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { computeSrcFingerprint } from "../tools/bridge/distfresh.mjs";
import { createSettle, gateDecision, uncommittedUnder } from "../tools/bridge/updategate.mjs";
import { buildAppStaged } from "../tools/bridge/appbuild.mjs";
import { RESTART_CODE } from "../tools/bridge/updatewatch.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");
const DISTFRESH_URL = pathToFileURL(path.resolve("tools/bridge/distfresh.mjs")).href;
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

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
function gitRepo(root: string): void {
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "core.autocrlf", "false");
}
const commitAll = (root: string) => { git(root, "add", "-A"); git(root, "commit", "-q", "-m", "c"); };

/** A stand-in build: honours ICONSPLITTER_OUT_DIR like vite.config does, stamps the page. */
function writeBuild(root: string, app: string, dist: string, extra = ""): string {
  const file = path.join(root, "build.mjs");
  writeFileSync(file, [
    `import { existsSync, mkdirSync, writeFileSync } from "node:fs";`,
    `import path from "node:path";`,
    `import { computeSrcFingerprint } from ${JSON.stringify(DISTFRESH_URL)};`,
    `if (existsSync(${JSON.stringify(path.join(root, "build-fails"))})) { console.error("stand-in build failed"); process.exit(1); }`,
    `const out = process.env.ICONSPLITTER_OUT_DIR || ${JSON.stringify(dist)};`,
    `mkdirSync(out, { recursive: true });`,
    `const stamp = ${extra || `computeSrcFingerprint([${JSON.stringify(app)}])`};`,
    `writeFileSync(path.join(out, "index.html"), '<html><head><meta name="iconsplitter-src-hash" content="' + stamp + '"></head><body>app</body></html>');`,
  ].join("\n"));
  return `node ${JSON.stringify(file)}`;
}

describe("the gate's pure parts", () => {
  it("settles only once the stamp has stayed the same for the quiet window", () => {
    let now = 0;
    const settle = createSettle(1_000, () => now);
    expect(settle.observe("a")).toBe(false);
    now = 500;
    expect(settle.observe("a")).toBe(false);
    now = 1_000;
    expect(settle.observe("a")).toBe(true);
    now = 1_100;
    expect(settle.observe("b")).toBe(false); // a new change restarts the window
    now = 2_200;
    expect(settle.observe("b")).toBe(true);
  });

  it("is ready only when settled, no git operation runs and nothing is uncommitted", () => {
    expect(gateDecision({ settled: false, gitBusy: false, dirty: [] })).toMatchObject({ ready: false, reason: "settling" });
    expect(gateDecision({ settled: true, gitBusy: true, dirty: [] })).toMatchObject({ ready: false, reason: "git-busy" });
    expect(gateDecision({ settled: true, gitBusy: false, dirty: ["src/a.ts"] })).toMatchObject({ ready: false, reason: "uncommitted" });
    expect(gateDecision({ settled: true, gitBusy: false, dirty: [] })).toMatchObject({ ready: true });
    // outside a git checkout git cannot say: the quiet window alone decides
    expect(gateDecision({ settled: true, gitBusy: false, dirty: null })).toMatchObject({ ready: true });
    // "save" mode (BRIDGE_UPDATE_ON=save) builds uncommitted work once it is quiet
    expect(gateDecision({ settled: true, gitBusy: false, dirty: ["src/a.ts"], mode: "save" })).toMatchObject({ ready: true });
  });
});

describe("what git says about the watched files", () => {
  it("names uncommitted and untracked files, nothing once committed, null outside git", async () => {
    const root = tempDir("gate-git-");
    gitRepo(root);
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "a.ts"), "1");
    writeFileSync(path.join(root, "index.html"), "<html></html>");
    commitAll(root);
    const watched = [path.join(root, "src"), path.join(root, "index.html")];
    expect(await uncommittedUnder(watched)).toEqual([]);
    writeFileSync(path.join(root, "src", "new.ts"), "imported before it is committed");
    expect((await uncommittedUnder(watched))?.join(" ")).toMatch(/new\.ts/);
    commitAll(root);
    writeFileSync(path.join(root, "index.html"), "<html>edited</html>");
    expect((await uncommittedUnder(watched))?.join(" ")).toMatch(/index\.html/);
    expect(await uncommittedUnder([tempDir("gate-nogit-")])).toBeNull();
  });
});

describe("the staged app build", () => {
  function box() {
    const root = tempDir("staged-");
    const app = path.join(root, "app");
    const dist = path.join(root, "dist");
    mkdirSync(app);
    mkdirSync(dist);
    writeFileSync(path.join(app, "main.js"), "1");
    writeFileSync(path.join(dist, "index.html"), "<html>previous bundle</html>");
    return { root, app, dist };
  }
  const leftovers = (root: string) => readdirSync(root).filter((name) => name.startsWith(".dist-staging-"));

  it("swaps a complete, correctly stamped bundle into dist and cleans the staging folder", async () => {
    const { root, app, dist } = box();
    const built = await buildAppStaged({ cmd: writeBuild(root, app, dist), cwd: root, dist, appDirs: [app] });
    expect(built).toMatchObject({ ok: true });
    expect(readFileSync(path.join(dist, "index.html"), "utf8")).toContain(computeSrcFingerprint([app]));
    expect(leftovers(root)).toEqual([]);
  });

  it("keeps the previous bundle when the build fails", async () => {
    const { root, app, dist } = box();
    writeFileSync(path.join(root, "build-fails"), "1");
    const built = await buildAppStaged({ cmd: writeBuild(root, app, dist), cwd: root, dist, appDirs: [app] });
    expect(built.ok).toBe(false);
    expect(readFileSync(path.join(dist, "index.html"), "utf8")).toBe("<html>previous bundle</html>");
    expect(leftovers(root)).toEqual([]);
  });

  it("refuses a bundle stamped for other sources (they changed during the build)", async () => {
    const { root, app, dist } = box();
    const built = await buildAppStaged({ cmd: writeBuild(root, app, dist, `"stale-stamp"`), cwd: root, dist, appDirs: [app] });
    expect(built).toMatchObject({ ok: false, retry: true });
    expect(readFileSync(path.join(dist, "index.html"), "utf8")).toBe("<html>previous bundle</html>");
  });
});

/** Resolves once the log shows `pattern`; rejects when it never does. */
function waitFor(log: string[], pattern: RegExp, limit = 20_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (pattern.test(log.join(""))) return resolve();
      if (Date.now() - started > limit) return reject(new Error(`timeout waiting for ${pattern}:\n${log.join("")}`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function startHelper(args: string[], log: string[]): ChildProcess {
  const child = spawn(process.execPath, [SERVER, "--port", "0", "--update-check-ms", "150", "--update-quiet-ms", "300", ...args], {
    env: { ...process.env, BRIDGE_TMP: tempDir("gate-tmp-"), BRIDGE_NO_UPDATE_WATCH: "", BRIDGE_UPDATE_ON: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (c) => log.push(c.toString()));
  child.stderr?.on("data", (c) => log.push(c.toString()));
  children.push(child);
  return child;
}

describe("the running helper", () => {
  function repoBox() {
    const root = tempDir("gate-helper-");
    gitRepo(root);
    const app = path.join(root, "app");
    const dist = path.join(root, "dist");
    const helper = path.join(root, "helper");
    for (const dir of [app, dist, helper]) mkdirSync(dir);
    writeFileSync(path.join(app, "main.js"), "export const v = 1;\n");
    writeFileSync(path.join(helper, "routes.mjs"), "export const helper = 1;\n");
    writeFileSync(path.join(helper, "entry.mjs"), "import './routes.mjs';\n");
    writeFileSync(path.join(root, ".gitignore"), "dist/\n.dist-staging-*/\n");
    const cmd = writeBuild(root, app, dist);
    writeFileSync(path.join(dist, "index.html"), `<html><head><meta name="iconsplitter-src-hash" content="${computeSrcFingerprint([app])}"></head></html>`);
    commitAll(root);
    const args = [
      "--dist", dist, "--app-dir", app, "--watch-dir", helper, "--build-cmd", cmd, "--build-cwd", root,
      "--self-test-script", path.join(helper, "entry.mjs"),
    ];
    return { root, app, dist, helper, args };
  }

  it("waits for a commit before rebuilding the app, then rebuilds", async () => {
    const box = repoBox();
    const log: string[] = [];
    const child = startHelper(box.args, log);
    await waitFor(log, /Update watch: ON/);
    writeFileSync(path.join(box.app, "main.js"), "import './later.js';\nexport const v = 2;\n");
    await waitFor(log, /not committed yet/);
    await new Promise((r) => setTimeout(r, 800));
    expect(log.join("")).not.toMatch(/rebuilding the bundle/);
    writeFileSync(path.join(box.app, "later.js"), "export {};\n");
    commitAll(box.root);
    await waitFor(log, /app bundle rebuilt/);
    expect(readFileSync(path.join(box.dist, "index.html"), "utf8")).toContain(computeSrcFingerprint([box.app]));
    expect(child.exitCode).toBeNull();
  }, 40_000);

  it("never hands over to helper code that does not load; restarts once it does", async () => {
    const box = repoBox();
    const log: string[] = [];
    const child = startHelper(box.args, log);
    await waitFor(log, /Update watch: ON/);
    writeFileSync(path.join(box.helper, "routes.mjs"), "export const helper = ;\n"); // a syntax error
    commitAll(box.root);
    await waitFor(log, /does not load[\s\S]*keeping this helper/);
    expect(child.exitCode).toBeNull();
    writeFileSync(path.join(box.helper, "routes.mjs"), "export const helper = 2;\n");
    commitAll(box.root);
    const code = await new Promise((r) => child.once("exit", r));
    expect(code).toBe(RESTART_CODE);
  }, 40_000);

  it("does not build a stale bundle just because a page asked for it", async () => {
    const box = repoBox();
    const log: string[] = [];
    startHelper(box.args, log);
    await waitFor(log, /listening on http:\/\/127\.0\.0\.1:(\d+)/);
    writeFileSync(path.join(box.app, "main.js"), "half-written edit");
    const port = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(log.join(""))?.[1];
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(log.join("")).not.toMatch(/Auto-build|rebuilding the app/);
    expect(existsSync(path.join(box.dist, "index.html"))).toBe(true);
  }, 30_000);
});
