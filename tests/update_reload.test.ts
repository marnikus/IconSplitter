// @vitest-environment node
// After a pull the helper rebuilds and restarts itself. The page it is serving is
// still the old bundle, so the app notices the new one and reloads itself — with a
// small confirmation instead of a silent jump, and never in the middle of a run.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  metaStampOf, reloadAllowed, reloadDecision, rememberNotice, servedBuildOf, servedNote, servedStampOf,
  stalledNote, takeNotice, updateNote,
} from "../src/lib/updatewatch";
import { servedBundle } from "../tools/bridge/distfresh.mjs";

const PAGE = (stamp: string) => `<!doctype html><html><head>
    <meta name="iconsplitter-src-hash" content="${stamp}" />
    <title>Icon Splitter</title></head><body><div id="root"></div></body></html>`;

describe("which build the page is running", () => {
  it("reads the stamp the build wrote into the page", () => {
    expect(metaStampOf(PAGE("abc123"))).toBe("abc123");
    expect(metaStampOf("<html><head></head></html>")).toBeNull();
    expect(metaStampOf("")).toBeNull();
  });

  it("tells a fresh bundle from the one on screen", () => {
    // Same stamp: the helper serves exactly what this page runs.
    expect(reloadDecision({ own: "abc123", served: "abc123", activeRuns: 0, dismissed: false })).toBe("none");
    // A rebuilt bundle: reload, but only when nothing is running.
    expect(reloadDecision({ own: "abc123", served: "def456", activeRuns: 0, dismissed: false })).toBe("reload");
    expect(reloadDecision({ own: "abc123", served: "def456", activeRuns: 1, dismissed: false })).toBe("wait");
    // Dismissed once: no reload until the user asks for it.
    expect(reloadDecision({ own: "abc123", served: "def456", activeRuns: 0, dismissed: true })).toBe("none");
    // A helper that does not report a bundle (older build) is not an update.
    expect(reloadDecision({ own: "abc123", served: null, activeRuns: 0, dismissed: false })).toBe("none");
  });
});

describe("what the small confirmation says", () => {
  it("names the commit and the time the build finished", () => {
    const note = updateNote({ commit: "2ca183c", builtAt: "2026-10-31T23:41:12.000Z" });
    expect(note.title).toBe("New build is running");
    expect(note.detail).toContain("2ca183c");
    expect(note.detail).toMatch(/rebuilt/i);
  });

  it("says plainly when the reload will happen instead of sounding like an error", () => {
    expect(servedNote({ reloading: false, activeRuns: 0 })).toMatch(/reloading/i);
    expect(servedNote({ reloading: false, activeRuns: 2 })).toMatch(/when this run finishes/i);
    expect(updateNote({ commit: null, builtAt: null }).detail).toMatch(/rebuilt/i);
  });
});

describe("what the helper reports it is serving", () => {
  const HEALTH = {
    ok: true,
    update: {
      watching: true, commit: "2ca183c9f0", restarts: 1,
      served: { stamp: "def456", builtAt: "2026-10-31T23:41:12.000Z" },
    },
  };

  it("reads the served stamp and the build identity out of /health", () => {
    expect(servedStampOf(HEALTH)).toBe("def456");
    expect(servedBuildOf(HEALTH)).toEqual({ commit: "2ca183c9f0", builtAt: "2026-10-31T23:41:12.000Z" });
  });

  it("treats an older helper that reports no bundle as no update at all", () => {
    expect(servedStampOf({ update: { watching: false, commit: "x", restarts: 0 } })).toBeNull();
    expect(servedStampOf(undefined)).toBeNull();
    expect(servedStampOf({ ok: false })).toBeNull();
  });

  it("stamps the file the helper serves from, with the time it was written", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "iconsplitter-served-"));
    try {
      const file = path.join(tmp, "index.html");
      writeFileSync(file, PAGE("abc123"));
      utimesSync(file, new Date("2026-10-31T23:41:12.000Z"), new Date("2026-10-31T23:41:12.000Z"));
      expect(servedBundle(file)).toEqual({ stamp: "abc123", builtAt: "2026-10-31T23:41:12.000Z" });
      // An unstamped page still reports when it was written, never a false stamp.
      writeFileSync(file, "<html></html>");
      expect(servedBundle(file)?.stamp).toBeNull();
      expect(servedBundle(path.join(tmp, "gone.html"))).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("a reload that cannot pick the build up does not loop", () => {
  it("allows one automatic reload per own→served pair, then hands over to the reader", () => {
    const first = reloadAllowed(null, "own1", "new1");
    expect(first.allowed).toBe(true);
    const second = reloadAllowed(first.next, "own1", "new1");
    expect(second.allowed).toBe(false);
    // A page that did pick up the new bundle starts a fresh pair.
    expect(reloadAllowed(first.next, "new1", "newer1").allowed).toBe(true);
  });

  it("treats junk in the mark as never having reloaded", () => {
    expect(reloadAllowed("{not json", "own1", "new1").allowed).toBe(true);
    expect(reloadAllowed('{"own":"own1","served":"new1","n":"x"}', "own1", "new1").allowed).toBe(true);
  });

  it("says the reader must press reload instead of pretending it is about to", () => {
    expect(stalledNote().action).toBe("Reload now");
    expect(stalledNote().detail).toMatch(/press reload/i);
  });
});

describe("carrying the confirmation through the reload", () => {
  it("shows the same line after the page swapped bundles", () => {
    const build = { commit: "2ca183c9f0", builtAt: "2026-10-31T23:41:12.000Z" };
    expect(takeNotice(rememberNotice(build))).toEqual(updateNote(build));
  });

  it("ignores a missing or unreadable note instead of throwing on boot", () => {
    expect(takeNotice(null)).toBeNull();
    expect(takeNotice("")).toBeNull();
    expect(takeNotice("{not json")).toBeNull();
    expect(takeNotice('{"commit":42}')).toBeNull();
  });
});

const HELPER = path.resolve("tools/bridge/server.mjs");
const liveHelpers: { child: ReturnType<typeof spawn>; tmp: string }[] = [];

afterEach(async () => {
  for (const h of liveHelpers.splice(0)) {
    h.child.kill();
    await new Promise((r) => h.child.once("exit", r));
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

async function startHelper(): Promise<{ url: string; dist: string }> {
  const tmp = mkdtempSync(path.join(tmpdir(), "iconsplitter-served-live-"));
  const dist = path.join(tmp, "dist");
  const child = spawn(process.execPath, [HELPER, "--port", "0", "--dist", dist, "--no-update-watch"], {
    env: { ...process.env, BRIDGE_TMP: tmp }, stdio: ["ignore", "pipe", "pipe"],
  });
  liveHelpers.push({ child, tmp });
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
  mkdirSync(dist, { recursive: true });
  return { url, dist };
}

describe("the live helper tells an open tab which bundle it serves", () => {
  it("reports the stamp of dist/index.html and follows a rebuild of that file", async () => {
    const { url, dist } = await startHelper();
    const file = path.join(dist, "index.html");
    writeFileSync(file, PAGE("first"));
    const before = await (await fetch(`${url}/health`)).json();
    expect(before.update.served.stamp).toBe("first");
    // The supervisor's rebuild replaces the file: the stamp the page compares against moves.
    writeFileSync(file, PAGE("second"));
    utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const after = await (await fetch(`${url}/health`)).json();
    expect(after.update.served.stamp).toBe("second");
    expect(servedStampOf(after)).not.toBe(servedStampOf(before));
  });
});
