// @vitest-environment node
// The helper keeps itself current: a `git pull` that changes its own code makes it
// restart in place (the launcher re-runs it), and never while an upload is moving.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RESTART_CODE, helperCodeStamp, readCommit, restartNote, shouldRestart,
} from "../tools/bridge/updatewatch.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");
const SUPERVISE = path.resolve("tools/bridge/supervise.mjs");

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

/** Resolves once the helper's own log shows `pattern`; rejects if it never does. */
function waitForLine(child: ChildProcess, log: string[], pattern: RegExp): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`helper timeout:\n${log.join("")}`)), 10_000);
    const onChunk = (chunk: Buffer) => {
      log.push(chunk.toString());
      if (pattern.test(log.join(""))) { clearTimeout(timer); resolve(); }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
  });
}

describe("the launchers keep the helper alive", () => {
  it("starts the helper through the supervisor, never the bare server", () => {
    // A launcher that runs server.mjs directly would leave the new code loaded
    // until the user closes the window by hand — the bug this watch exists for.
    for (const bat of ["run_ftp_bridge.bat", "run_app_ftp.bat", "run_app_inkscape.bat", "run_inkscape_bridge.bat"]) {
      const text = readFileSync(path.resolve(bat), "utf8");
      expect(text).toContain("tools\\bridge\\supervise.mjs");
      expect(text).not.toMatch(/node tools\\bridge\\server\.mjs/);
      // A restart must rebuild the app too, exactly like a fresh launch does.
      expect(text).toContain("supervise.mjs --build");
    }
  });
});

describe("what makes the helper restart", () => {
  it("follows the bytes of its own code, not the clock", () => {
    const root = tempDir("helper-code-");
    mkdirSync(path.join(root, "gettyweb"), { recursive: true });
    const file = path.join(root, "gettyweb", "session.mjs");
    writeFileSync(file, "export const a = 1;\n");
    const before = helperCodeStamp([root]);
    // Same bytes, touched again: nothing to restart for.
    writeFileSync(file, "export const a = 1;\n");
    expect(helperCodeStamp([root])).toBe(before);
    // A pulled commit changed the code: this is the signal.
    writeFileSync(file, "export const a = 2;\n");
    expect(helperCodeStamp([root])).not.toBe(before);
  });

  it("reads the commit a `git pull` moved HEAD to, and says nothing when there is none", () => {
    const root = tempDir("helper-git-");
    mkdirSync(path.join(root, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(path.join(root, ".git", "refs", "heads", "main"), "3f9c2a1d4b5e6f708192a3b4c5d6e7f8091a2b3c\n");
    expect(readCommit(root)).toBe("3f9c2a1");
    // Detached HEAD (a checkout of a tag or a commit) still names the commit.
    writeFileSync(path.join(root, ".git", "HEAD"), "aabbccddeeff00112233445566778899aabbccdd\n");
    expect(readCommit(root)).toBe("aabbccd");
    expect(readCommit(tempDir("helper-nogit-"))).toBeNull();
  });

  it("waits for an upload instead of cutting it off", () => {
    expect(shouldRestart("aaa", "aaa", { busy: false })).toBe(false);
    expect(shouldRestart("aaa", "bbb", { busy: true })).toBe(false);
    expect(shouldRestart("aaa", "bbb", { busy: false })).toBe(true);
  });

  it("says which commit it is restarting for, and names no file of the user's", () => {
    const note = restartNote({ commit: "3f9c2a1", restarts: 2 });
    expect(note).toContain("3f9c2a1");
    expect(note).toContain("restart 2");
    expect(restartNote({ commit: null, restarts: 1 })).toContain("restart 1");
  });
});

describe("the launcher that keeps the helper alive", () => {
  it("re-runs the helper after a restart code, and stops when it exits cleanly", async () => {
    const dir = tempDir("helper-supervise-");
    const runs = path.join(dir, "runs.txt");
    const childScript = path.join(dir, "child.mjs");
    writeFileSync(childScript, [
      "import { appendFileSync, readFileSync } from 'node:fs';",
      `const runs = ${JSON.stringify(runs)};`,
      "const seen = (() => { try { return readFileSync(runs, 'utf8').trim().split('\\n').length; } catch { return 0; } })();",
      "appendFileSync(runs, 'run\\n');",
      `process.exit(seen === 0 ? ${RESTART_CODE} : 0);`,
    ].join("\n"));
    const sup = spawn(process.execPath, [SUPERVISE, "--child", childScript, "--max-restarts", "3"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(sup);
    const log: string[] = [];
    sup.stdout?.on("data", (c) => log.push(c.toString()));
    sup.stderr?.on("data", (c) => log.push(c.toString()));
    const code = await new Promise<number | null>((r) => sup.once("exit", r));
    // Restart code → one more run; the second run exits 0 → the launcher is done.
    expect(code).toBe(0);
    expect(log.join("")).toMatch(/restart/i);
  }, 20_000);
});

describe("the helper restarts itself when its code changes", () => {
  it("exits with the restart code as soon as the new code is on disk", async () => {
    const watch = tempDir("helper-watch-");
    const watchedFile = path.join(watch, "routes.mjs");
    writeFileSync(watchedFile, "export const version = 1;\n");
    const child = spawn(process.execPath, [SERVER, "--port", "0", "--watch-dir", watch], {
      env: { ...process.env, BRIDGE_UPDATE_CHECK_MS: "120", BRIDGE_TMP: tempDir("helper-tmp-") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const log: string[] = [];
    await waitForLine(child, log, /Update watch: ON/);
    // The baseline is the code the helper booted from; let it take that reading.
    await new Promise((r) => setTimeout(r, 400));
    // A `git pull` lands: the helper's own code changed under it.
    writeFileSync(watchedFile, "export const version = 2;\n");
    const code = await new Promise<number | null>((r) => child.once("exit", r));
    expect(code).toBe(RESTART_CODE);
    expect(log.join("")).toMatch(/helper code changed.*restarting/i);
  }, 20_000);

  it("keeps running when the option is off", async () => {
    const watch = tempDir("helper-watch-off-");
    const watchedFile = path.join(watch, "routes.mjs");
    writeFileSync(watchedFile, "export const version = 1;\n");
    const child = spawn(process.execPath, [SERVER, "--port", "0", "--watch-dir", watch, "--no-update-watch"], {
      env: { ...process.env, BRIDGE_UPDATE_CHECK_MS: "120", BRIDGE_TMP: tempDir("helper-tmp-") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const log: string[] = [];
    await waitForLine(child, log, /listening on http:\/\/127\.0\.0\.1:\d+/);
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(watchedFile, "export const version = 2;\n");
    await new Promise((r) => setTimeout(r, 600));
    expect(child.exitCode).toBeNull();
    expect(log.join("")).not.toMatch(/restarting/i);
  }, 20_000);
});
