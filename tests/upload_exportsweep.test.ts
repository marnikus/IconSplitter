// upload_exportsweep.test.ts — the export folder's own housekeeping
// (2026-10-08). A folder exported before the naming change carries files the
// current rule no longer writes (`fog_AI.eps` beside `fog.svg`/`fog.jpg`), and
// the user asked for the package to end up under ONE name. The sweep removes
// only what this app provably wrote, and only when the replacement is there.
import { describe, expect, it } from "vitest";
import { sweepSuperseded } from "../src/upload/exportsweep";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function dirWith(...names: string[]): FakeDir {
  const dir = new FakeDir("export");
  for (const name of names) dir.children.set(name, new FakeFile(name, 100, 1, "x"));
  return dir as FakeDir & { removeEntry: (n: string) => Promise<void> };
}

function names(dir: FakeDir): string[] {
  return [...dir.children.keys()].sort();
}

describe("sweeping the export folder", () => {
  it("removes the app's own superseded artifacts once their replacement is there", async () => {
    const dir = dirWith("fog.svg", "fog.jpg", "fog.eps", "fog_AI.svg", "fog_AI.jpg", "fog_AI.eps");
    const removed = await sweepSuperseded(dir, "fog", new Set());
    expect(names(dir)).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
    expect(removed.sort()).toEqual(["fog_AI.eps", "fog_AI.jpg", "fog_AI.svg"]);
  });

  it("knows every form of our own bookkeeping", async () => {
    const dir = dirWith("fog.svg", "fog_AI_v2.svg", "fog_AI_7_04.eps", "fog_AI_9_01.jpg", "fog.jpg", "fog.eps");
    await sweepSuperseded(dir, "fog", new Set());
    expect(names(dir)).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
  });

  it("keeps a superseded file the package CLAIMS when the replacement is not there", async () => {
    const dir = dirWith("fog.eps", "fog_AI.svg", "fog_AI.jpg");  // no fog.svg / fog.jpg at all
    const named = new Set(["fog_AI.svg", "fog_AI.jpg"]);
    expect(await sweepSuperseded(dir, "fog", named)).toEqual([]);
    expect(names(dir)).toEqual(["fog.eps", "fog_AI.jpg", "fog_AI.svg"]);
  });

  it("removes an orphan the package never claimed — the old EPS a rename left behind", async () => {
    const dir = dirWith("fog.svg", "fog.jpg", "fog_AI.eps");
    const named = new Set(["fog.svg", "fog.jpg"]); // the record names the current files only
    expect(await sweepSuperseded(dir, "fog", named)).toEqual(["fog_AI.eps"]);
    expect(names(dir)).toEqual(["fog.jpg", "fog.svg"]);
  });

  it("never touches another icon, a foreign file, or the record", async () => {
    const dir = dirWith("fog.svg", "fog.jpg", "fog.eps", "export.json", "notes.txt", "arch_AI.svg",
      "fogv2.eps", "fog_AI_x.eps", "banner.jpg");
    expect(await sweepSuperseded(dir, "fog", new Set())).toEqual([]);
    expect(names(dir)).toEqual(["arch_AI.svg", "banner.jpg", "export.json", "fog.eps", "fog.jpg",
      "fog.svg", "fog_AI_x.eps", "fogv2.eps", "notes.txt"].sort());
  });

  it("is a no-op on a folder that already only carries the current names", async () => {
    const dir = dirWith("fog.svg", "fog.jpg", "fog.eps", "export.json");
    expect(await sweepSuperseded(dir, "fog", new Set())).toEqual([]);
    expect(names(dir)).toEqual(["export.json", "fog.eps", "fog.jpg", "fog.svg"]);
  });
});
