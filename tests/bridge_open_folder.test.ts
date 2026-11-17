// @vitest-environment node
// bridge_open_folder.test.ts — the helper's "open this folder in Explorer"
// (2026-11-16, tools/bridge/openfolder.mjs). Only an EXISTING FOLDER given as a
// full path is opened; the launcher is given the path as its only argument (no
// shell). The launcher is injected: nothing really opens here.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs module of the helper
import { checkFolder, openFolder } from "../tools/bridge/openfolder.mjs";

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tempDir = () => { const d = mkdtempSync(path.join(tmpdir(), "openfolder-")); made.push(d); return d; };

describe("helper: open a folder", () => {
  it("refuses anything but an existing folder given as a full path", () => {
    const dir = tempDir();
    const file = path.join(dir, "a.txt");
    writeFileSync(file, "x");
    expect(checkFolder(dir)).toEqual({ ok: true, path: path.resolve(dir) });
    expect(checkFolder(file).ok).toBe(false); // a file is never opened (or run)
    expect(checkFolder(path.join(dir, "missing")).ok).toBe(false);
    expect(checkFolder("relative/dir").ok).toBe(false);
    expect(checkFolder("").ok).toBe(false);
    expect(checkFolder(42).ok).toBe(false);
  });

  it("opens the folder with the platform's file manager, the path as the only argument", () => {
    const dir = tempDir();
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const out = openFolder(dir, { launch: (cmd: string, args: string[]) => { calls.push({ cmd, args }); }, platform: "win32" });
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([{ cmd: "explorer.exe", args: [`"${path.resolve(dir)}"`] }]);
    const mac: Array<{ cmd: string; args: string[] }> = [];
    openFolder(dir, { launch: (cmd: string, args: string[]) => { mac.push({ cmd, args }); }, platform: "darwin" });
    expect(mac[0].cmd).toBe("open");
    expect(openFolder(path.join(dir, "nope"), { launch: () => { throw new Error("must not run"); }, platform: "win32" }).ok).toBe(false);
  });

  it("selects a file in its folder when asked (Explorer /select), and only a real file inside that folder", () => {
    const dir = tempDir();
    const file = path.join(dir, "icon.svg");
    writeFileSync(file, "<svg/>");
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const launch = (cmd: string, args: string[]) => { calls.push({ cmd, args }); };
    expect(openFolder(dir, { launch, platform: "win32", select: file })).toEqual({ ok: true });
    expect(calls[0]).toEqual({ cmd: "explorer.exe", args: [`/select,"${path.resolve(file)}"`] });
    openFolder(dir, { launch, platform: "darwin", select: file });
    expect(calls[1]).toEqual({ cmd: "open", args: ["-R", path.resolve(file)] });
    expect(openFolder(dir, { launch, platform: "win32", select: path.join(dir, "missing.svg") }).ok).toBe(false);
    expect(openFolder(dir, { launch, platform: "win32", select: path.join(tmpdir(), "elsewhere.txt") }).ok).toBe(false); // not inside
  });
});
