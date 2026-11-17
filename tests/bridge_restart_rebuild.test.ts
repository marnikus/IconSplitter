// @vitest-environment node
// A restart must be a **full** restart, the same thing `run_ftp_bridge.bat` does:
// rebuild the app bundle, then start the helper again with the flags it was given.
// A restart that only re-execs Node leaves the page on the old build.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SUPERVISE = path.resolve("tools/bridge/supervise.mjs");

const children: ChildProcess[] = [];
const temps: string[] = [];

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

/** A helper stand-in: records its run, exits 75 the first time, 0 the second. */
function fakeHelper(dir: string, name = "helper"): string {
  const script = path.join(dir, `${name}.mjs`);
  const runs = path.join(dir, `${name}-runs.txt`);
  writeFileSync(script, [
    "import { appendFileSync, readFileSync } from 'node:fs';",
    `const runs = ${JSON.stringify(runs)};`,
    "let seen = 0;",
    "try { seen = readFileSync(runs, 'utf8').trim().split('\\n').filter(Boolean).length; } catch {}",
    "appendFileSync(runs, `run ${process.argv.slice(2).join(' ')}\\n`);",
    "process.exit(seen === 0 ? 75 : 0);",
  ].join("\n"));
  return script;
}

/** A build stand-in: appends one line to a log so the test can count builds. */
function fakeBuild(dir: string): { command: string; log: string } {
  const script = path.join(dir, "build.mjs");
  const log = path.join(dir, "builds.txt");
  // Like vite.config (2026-11-13): a stamped index.html into ICONSPLITTER_OUT_DIR, the staging folder.
  const distfresh = pathToFileURL(path.resolve("tools/bridge/distfresh.mjs")).href;
  writeFileSync(script, [
    "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    `import { computeSrcFingerprint } from ${JSON.stringify(distfresh)};`,
    `appendFileSync(${JSON.stringify(log)}, 'built\\n');`,
    "const out = process.env.ICONSPLITTER_OUT_DIR;",
    "mkdirSync(out, { recursive: true });",
    "writeFileSync(path.join(out, 'index.html'), `<meta name=\"iconsplitter-src-hash\" content=\"${computeSrcFingerprint([])}\">`);",
    "console.log('vite build (fake)');",
  ].join("\n"));
  return { command: `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`, log };
}

function buildCount(log: string): number {
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length : 0;
}

async function runSupervisor(args: string[]): Promise<{ code: number | null; out: string }> {
  // Its own build folder: a staged build swaps into <build-cwd>/dist — never the repo's real dist/.
  const sup = spawn(process.execPath, [SUPERVISE, "--build-cwd", tempDir("sup-cwd-"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(sup);
  let out = "";
  sup.stdout?.on("data", (c) => { out += c.toString(); });
  sup.stderr?.on("data", (c) => { out += c.toString(); });
  const code = await new Promise<number | null>((r) => sup.once("exit", r));
  return { code, out };
}

describe("a restart rebuilds the app, like the .bat does", () => {
  it("builds before starting the new helper, and only from the second start", async () => {
    const dir = tempDir("rebuild-");
    const helper = fakeHelper(dir);
    const build = fakeBuild(dir);
    const { code, out } = await runSupervisor([
      "--child", helper, "--build", "--build-cmd", build.command,
    ]);
    expect(code).toBe(0);
    // One build for the one restart — the launcher's own first build is not repeated.
    expect(buildCount(build.log)).toBe(1);
    expect(out).toMatch(/app bundle rebuilt/i);
    expect(out).toMatch(/supervisor: starting the new helper \(restart 1\)/);
  }, 30_000);

  it("hands the helper the flags the window was started with", async () => {
    const dir = tempDir("flags-");
    const helper = fakeHelper(dir);
    const build = fakeBuild(dir);
    await runSupervisor([
      "--child", helper, "--build", "--build-cmd", build.command,
      "--getty-headed", "--getty-profile", "C:\\profiles\\getty",
    ]);
    const runs = readFileSync(path.join(dir, "helper-runs.txt"), "utf8").trim().split("\n");
    expect(runs).toHaveLength(2);
    for (const line of runs) {
      expect(line).toContain("--getty-headed");
      expect(line).toContain("--getty-profile C:\\profiles\\getty");
    }
  }, 30_000);

  it("starts the helper anyway when the build fails, and says the bundle is the old one", async () => {
    const dir = tempDir("buildfail-");
    const helper = fakeHelper(dir);
    const broken = path.join(dir, "broken.mjs");
    writeFileSync(broken, "console.error('vite: something is broken');\nprocess.exit(1);\n");
    const { code, out } = await runSupervisor([
      "--child", helper, "--build", "--build-cmd", `${JSON.stringify(process.execPath)} ${JSON.stringify(broken)}`,
    ]);
    expect(code).toBe(0);
    expect(out).toMatch(/rebuild failed/i);
    expect(out).toMatch(/serving the previous bundle/i);
    expect(out).toMatch(/starting the new helper/i);
  }, 30_000);

  it("does not build when the window did not ask for it", async () => {
    const dir = tempDir("nobuild-");
    const helper = fakeHelper(dir);
    const build = fakeBuild(dir);
    await runSupervisor(["--child", helper, "--build-cmd", build.command]);
    expect(buildCount(build.log)).toBe(0);
  }, 30_000);
});
