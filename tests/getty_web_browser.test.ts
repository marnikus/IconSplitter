// The launcher half of a Getty web run: which profile folder may be used, what
// to do when a browser already owns it, and what to say when the DevTools socket
// refuses the connection. Chrome/Edge does not need to be installed here — the
// spawn and the port probe are injectable, so the decisions are tested directly.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideProfileUse, launchBrowser, profileLocks, profileProcessIds, resetProfile, resolveProfileDir,
} from "../tools/bridge/gettyweb/browser.mjs";
import { cdpFailureReason, failureOutcome, releaseSession } from "../tools/bridge/gettyweb/session.mjs";

function tempProfile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "getty-web-browser-test-"));
  return dir;
}

/** Writes the DevToolsActivePort file a (possibly dead) Chrome leaves behind. */
function writeActivePort(dir: string, port: number): void {
  writeFileSync(path.join(dir, "DevToolsActivePort"), `${port}\n/devtools/browser/stale-id\n`);
}

/** Any existing executable works: the spawn itself is faked below. */
const FAKE_BROWSER_ENV = { GETTY_WEB_BROWSER: process.execPath };

const fakeChild = (onSpawn?: () => void) => ({
  exitCode: null as number | null,
  pid: 4242,
  kill: () => true,
  onSpawn,
});

describe("Getty web browser profile decisions", () => {
  it("only reuses a folder when the user named one", () => {
    expect(resolveProfileDir("  ")).toBeNull();
    expect(resolveProfileDir("/tmp/getty-profile")).toBe(path.resolve("/tmp/getty-profile"));
  });

  it("reattaches to a running browser, launches in a free folder, and refuses a busy one", () => {
    expect(decideProfileUse({ locked: false, answers: false })).toBe("launch");
    expect(decideProfileUse({ locked: false, answers: true })).toBe("attach");
    expect(decideProfileUse({ locked: true, answers: true })).toBe("attach");
    expect(decideProfileUse({ locked: true, answers: false })).toBe("busy");
  });

  it("sees the lock files Chrome leaves in a profile folder", () => {
    const dir = tempProfile();
    try {
      expect(profileLocks(dir)).toEqual([]);
      writeFileSync(path.join(dir, "SingletonLock"), "host-1234");
      writeFileSync(path.join(dir, "lockfile"), "");
      expect(profileLocks(dir).sort()).toEqual(["SingletonLock", "lockfile"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Getty web profile reset", () => {
  it("finds only the browsers that were started with this profile folder", () => {
    const json = JSON.stringify([
      { ProcessId: 4242, CommandLine: 'chrome.exe --headless=new --user-data-dir=/tmp/getty-profile --remote-debugging-port=0' },
      { ProcessId: 4343, CommandLine: 'chrome.exe --user-data-dir=/tmp/getty-profile-old' },
      { ProcessId: 4444, CommandLine: 'chrome.exe --user-data-dir="C:\\Users\\me\\AppData\\Local\\IconSplitter\\getty-profile"' },
      { ProcessId: 4545, CommandLine: "msedge.exe --profile-directory=Default" },
    ]);
    expect(profileProcessIds(json, "/tmp/getty-profile")).toEqual([4242]);
    expect(profileProcessIds(json, "C:\\Users\\me\\AppData\\Local\\IconSplitter\\getty-profile")).toEqual([4444]);
  });

  it("reads a ps listing too, and never a browser without the folder", () => {
    const ps = [
      "  4242 /usr/bin/google-chrome --headless=new --user-data-dir=/tmp/getty-profile",
      "  4343 /usr/bin/google-chrome --user-data-dir=/tmp/other-profile",
      "  4444 /usr/bin/msedge",
    ].join("\n");
    expect(profileProcessIds(ps, "/tmp/getty-profile")).toEqual([4242]);
    expect(profileProcessIds("", "/tmp/getty-profile")).toEqual([]);
    expect(profileProcessIds("garbage {{{", "/tmp/getty-profile")).toEqual([]);
  });

  it("kills that browser and clears the stale locks so the next launch is free", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-4242");
    writeActivePort(dir, 61111);
    const killed: number[][] = [];
    try {
      const result = await resetProfile(dir, {
        listProcesses: async () => JSON.stringify([
          { ProcessId: 4242, CommandLine: `chrome.exe --user-data-dir=${dir}` },
        ]),
        killPids: (pids: number[]) => { killed.push(pids); },
      });
      expect(result.reset).toBe(true);
      expect(result.killed).toEqual([4242]);
      expect(killed).toEqual([[4242]]);
      expect(profileLocks(dir)).toEqual([]);
      expect(profileProcessIds(`${dir}`, dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("clears stale locks left by a crashed browser even when no process matches", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-999");
    writeFileSync(path.join(dir, "lockfile"), "");
    try {
      const result = await resetProfile(dir, { listProcesses: async () => "", killPids: () => {} });
      expect(result).toEqual({ reset: true, killed: [], reason: null });
      expect(profileLocks(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says so when the process list cannot be read at all", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-999");
    try {
      const result = await resetProfile(dir, {
        listProcesses: async () => { throw new Error("tasklist refused"); },
        killPids: () => {},
      });
      expect(result.reset).toBe(false);
      expect(result.reason).toContain("tasklist refused");
      expect(result.reason).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Getty web browser launch", () => {
  it("ignores a stale DevToolsActivePort and uses the port the new browser opens", async () => {
    const dir = tempProfile();
    writeActivePort(dir, 61111);
    const probes: number[] = [];
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => {
          writeActivePort(dir, 62222);
          return fakeChild();
        },
        probeSocket: async (port: number) => {
          probes.push(port);
          return port === 62222 ? "ws://127.0.0.1:62222/devtools/browser/live" : null;
        },
        timeoutMs: 2000,
      });
      expect(launched.ok).toBe(true);
      if (launched.ok) {
        expect(launched.port).toBe(62222);
        expect(launched.socket).toContain("62222");
      }
      expect(probes).toContain(61111);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("attaches to the browser that already owns the profile instead of failing", async () => {
    const dir = tempProfile();
    writeActivePort(dir, 63333);
    let spawned = false;
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => { spawned = true; return fakeChild(); },
        probeSocket: async () => "ws://127.0.0.1:63333/devtools/browser/running",
        timeoutMs: 500,
      });
      expect(launched.ok).toBe(true);
      expect(spawned).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kills the stuck browser on its own profile and relaunches, without any manual close", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-4242");
    const killed: number[][] = [];
    let spawned = 0;
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => {
          spawned += 1;
          writeActivePort(dir, 65555);
          return fakeChild();
        },
        probeSocket: async (port: number) => (port === 65555 ? "ws://127.0.0.1:65555/devtools/browser/fresh" : null),
        listProcesses: async () => JSON.stringify([{ ProcessId: 4242, CommandLine: `chrome --user-data-dir=${dir}` }]),
        killPids: (pids: number[]) => { killed.push(pids); },
        timeoutMs: 2000,
      });
      expect(launched.ok).toBe(true);
      expect(killed).toEqual([[4242]]);
      expect(spawned).toBe(1);
      if (launched.ok) expect(launched.port).toBe(65555);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can be told not to touch a browser, and then names the folder", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-999");
    let touched = false;
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => fakeChild(),
        probeSocket: async () => null,
        resetProfile: false,
        listProcesses: async () => { touched = true; return ""; },
        killPids: () => { touched = true; },
        timeoutMs: 300,
      });
      expect(launched.ok).toBe(false);
      expect(touched).toBe(false);
      if (!launched.ok) {
        expect(launched.code).toBe("browser");
        expect(launched.reason).toContain(dir);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still asks the user to install a browser when none is found", async () => {
    const launched = await launchBrowser({ env: { GETTY_WEB_BROWSER: "/nonexistent/chrome" }, timeoutMs: 200 });
    expect(launched.ok).toBe(false);
    if (!launched.ok) expect(launched.reason).toContain("install Google Chrome");
  });

  it("reports a socket that never answers with the port and the profile folder", async () => {
    const dir = tempProfile();
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => { writeActivePort(dir, 64444); return fakeChild(); },
        probeSocket: async () => null,
        timeoutMs: 600,
      });
      expect(launched.ok).toBe(false);
      if (!launched.ok) {
        expect(launched.code).toBe("browser");
        expect(launched.reason).toContain("64444");
        expect(launched.reason).toContain(dir);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Getty web socket failure reason", () => {
  it("turns a refused DevTools socket into an actionable hint without leaking anything", () => {
    const reason = cdpFailureReason(new Error("browser debugging socket failed"), {
      port: 65111, profileDir: "/tmp/getty-profile",
    });
    expect(reason).toContain("65111");
    expect(reason).toContain("/tmp/getty-profile");
    expect(reason).toContain("GETTY_WEB_CDP");
    expect(reason).not.toContain("browser debugging socket failed");
  });

  it("still explains an attach-mode socket failure", () => {
    const reason = cdpFailureReason(new Error("boom"), { port: 9222 });
    expect(reason).toContain("9222");
    expect(reason).toContain("GETTY_WEB_CDP");
  });
});

describe("Getty web visible window", () => {
  it("keeps the sign-in page on screen when a headed run fails", () => {
    const headed = failureOutcome(true, "the sign-in form never appeared");
    expect(headed.keepOpen).toBe(true);
    expect(headed.reason).toContain("the sign-in form never appeared");
    expect(headed.reason).toContain("left open");

    expect(failureOutcome(false, "the sign-in form never appeared")).toEqual({
      keepOpen: false, reason: "the sign-in form never appeared",
    });
  });

  it("never leaves an unnamed, empty reason behind in either mode", () => {
    expect(failureOutcome(true, "  ").reason).toContain("could not be prepared");
    expect(failureOutcome(false, undefined).reason).toBe("the browser page could not be prepared");
  });

  it("detaches from a visible window and closes a hidden one", () => {
    const calls: string[] = [];
    const session = { close: () => calls.push("close"), detach: () => calls.push("detach") };
    expect(releaseSession(session, true)).toBe("kept");
    expect(releaseSession(session, false)).toBe("closed");
    expect(calls).toEqual(["detach", "close"]);
  });

  it("closes a session that cannot detach, whatever the mode", () => {
    const calls: string[] = [];
    expect(releaseSession({ close: () => calls.push("close") }, true)).toBe("closed");
    expect(calls).toEqual(["close"]);
  });
});
