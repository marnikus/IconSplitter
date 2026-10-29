// The launcher half of a Getty web run: which profile folder may be used, what
// to do when a browser already owns it, and what to say when the DevTools socket
// refuses the connection. Chrome/Edge does not need to be installed here — the
// spawn and the port probe are injectable, so the decisions are tested directly.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideProfileUse, launchBrowser, profileLocks, resolveProfileDir,
} from "../tools/bridge/gettyweb/browser.mjs";
import { cdpFailureReason } from "../tools/bridge/gettyweb/session.mjs";

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
  once: () => {},
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

  it("says which folder is busy when a locked profile has no DevTools port", async () => {
    const dir = tempProfile();
    writeFileSync(path.join(dir, "SingletonLock"), "host-999");
    try {
      const launched = await launchBrowser({
        profileDir: dir,
        env: FAKE_BROWSER_ENV,
        spawnFn: () => fakeChild(),
        probeSocket: async () => null,
        timeoutMs: 300,
      });
      expect(launched.ok).toBe(false);
      if (!launched.ok) {
        expect(launched.code).toBe("browser");
        expect(launched.reason).toContain(dir);
        expect(launched.reason).toContain("close");
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


describe("visible Getty window ownership", () => {
  it("leaves the launched browser alive when automation disconnects", async () => {
    const dir = tempProfile();
    let unreferenced = false;
    const child = { ...fakeChild(), unref: () => { unreferenced = true; } };
    try {
      const launched = await launchBrowser({
        profileDir: dir, env: FAKE_BROWSER_ENV, headed: true,
        spawnFn: () => { writeActivePort(dir, 62222); return child; },
        probeSocket: async () => "ws://127.0.0.1:62222/devtools/browser/live",
      });
      expect(launched.ok).toBe(true);
      if (launched.ok) launched.stop({ keepOpen: true });
      expect(unreferenced).toBe(true);
      expect(readFileSync(path.join(dir, "DevToolsActivePort"), "utf8")).toContain("62222");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
