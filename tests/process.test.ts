// TDD cycle 9 — batch orchestrator: plan + split + no-overwrite writes +
// per-item isolation + stop (RULE 5/7). splitImage injected; fs via fakes.
import { describe, expect, it } from "vitest";
import { processItems, type BatchItem } from "../src/batch/process";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const date = new Date(2026, 8, 30, 14, 32, 8);
const SPLIT = { padding: 6, size: 0, transparent: false, mergeFrac: null };

function item(relPath: string, ref: string | null, opts?: { gone?: boolean }): BatchItem {
  const relDir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
  const name = relPath.split("/").pop()!;
  const file = new FakeFile(name);
  if (opts?.gone) file.getFile = async () => { throw new DOMException("gone", "NotFoundError"); };
  return {
    source: { relPath, name, relDir, refRelPath: ref },
    file,
    refFile: ref ? new FakeFile(ref.split("/").pop()!) : null,
  };
}

const twoBlobs = async () => [new Blob(["a"]), new Blob(["b"])];

describe("processItems — output tree per spec §5", () => {
  it("writes split_NN subfolders with numbered images and a reference copy in each", async () => {
    const dest = new FakeDir("_split_output");
    const items = [item("Category-A/icon-award-ribbon_AI.png", "Category-A/icon-award-ribbon.png")];
    const report = await processItems(items, { dest, split: SPLIT, splitImage: twoBlobs, now: date });
    expect(report.relBase).toBe("2026-09/2026-09-30_14-32-08");
    const folder = await dest.getDirectoryHandle("2026-09").then((m) => m.getDirectoryHandle("2026-09-30_14-32-08"));
    const cat = await folder.getDirectoryHandle("Category-A");
    const src = await cat.getDirectoryHandle("icon-award-ribbon_AI");
    const s1 = await src.getDirectoryHandle("split_01");
    const s2 = await src.getDirectoryHandle("split_02");
    expect([...s1.children.keys()]).toEqual(["icon-award-ribbon_AI_01.png", "icon-award-ribbon.png"]);
    expect([...s2.children.keys()]).toEqual(["icon-award-ribbon_AI_02.png", "icon-award-ribbon.png"]);
    expect(report.results[0].outcome).toBe("processed");
    expect(report.results[0].splits).toBe(2);
    expect(report.results[0].refCopied).toBe(true);
  });

  it("an already-existing output folder forces _v02 (never overwrite, spec §5)", async () => {
    const dest = new FakeDir("out");
    // Pre-create the exact output folder the plan would want.
    const pre = await dest.getDirectoryHandle("2026-09", { create: true });
    const stamp = await pre.getDirectoryHandle("2026-09-30_14-32-08", { create: true });
    const dirA = await stamp.getDirectoryHandle("a", { create: true });
    await dirA.getDirectoryHandle("icon_AI", { create: true });
    const items = [item("a/icon_AI.png", null)];
    await processItems(items, { dest, split: SPLIT, splitImage: twoBlobs, now: date });
    expect([...dirA.children.keys()].sort()).toEqual(["icon_AI", "icon_AI_v02"]);
  });

  it("empty sheet is skipped honestly — no folder created (RULE 4)", async () => {
    const dest = new FakeDir("out");
    const items = [item("a/x_AI.png", null)];
    const report = await processItems(items, { dest, split: SPLIT, splitImage: async () => [], now: date });
    expect(report.results[0].outcome).toBe("skipped");
    expect(report.results[0].message).toMatch(/no icons/i);
    expect(dest.children.size).toBe(0);
  });

  it("a file deleted before processing is skipped safely; batch continues (spec §6)", async () => {
    const dest = new FakeDir("out");
    const items = [item("a/gone_AI.png", null, { gone: true }), item("a/ok_AI.png", null)];
    const report = await processItems(items, { dest, split: SPLIT, splitImage: twoBlobs, now: date });
    expect(report.results.map((r) => r.outcome)).toEqual(["skipped", "processed"]);
    expect(report.results[0].message).toMatch(/missing/i);
  });

  it("a split failure is isolated and reported; next item still runs (RULE 5)", async () => {
    const dest = new FakeDir("out");
    const items = [item("a/bad_AI.png", null), item("a/good_AI.png", null)];
    const splitImage = async (f: File) => {
      if (f.name === "bad_AI.png") throw new Error("Could not read image");
      return [new Blob(["x"])];
    };
    const report = await processItems(items, { dest, split: SPLIT, splitImage, now: date });
    expect(report.results.map((r) => r.outcome)).toEqual(["failed", "processed"]);
    expect(report.results[0].message).toBe("Could not read image");
  });

  it("missing reference still processes, without the copy, with a warning (spec §4)", async () => {
    const dest = new FakeDir("out");
    const items = [item("a/x_AI.png", null)];
    const report = await processItems(items, { dest, split: SPLIT, splitImage: twoBlobs, now: date });
    expect(report.results[0].outcome).toBe("processed");
    expect(report.results[0].refCopied).toBe(false);
    expect(report.results[0].message).toMatch(/reference/i);
  });

  it("stop between items halts the rest (RULE 7)", async () => {
    const dest = new FakeDir("out");
    const items = [item("a/one_AI.png", null), item("a/two_AI.png", null)];
    let calls = 0;
    const report = await processItems(items, {
      dest, split: SPLIT, splitImage: twoBlobs, now: date,
      shouldStop: () => ++calls > 1,
    });
    expect(report.stopped).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].outcome).toBe("processed");
  });
});
