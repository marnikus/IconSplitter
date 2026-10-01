// RULE 8 — processBatch runs for real: analyze/detect/renderIcon execute
// over synthetic pixels, outputs land in the fake FS. Deleting the feature
// fails here. Only browser FS + Image decode + toBlob are faked.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FsFile } from "../../src/batch/fs";
import { readTextFile } from "../../src/batch/fs";
import { defaultPreset, settingsOf } from "../../src/batch/presets";
import { processBatch, type ProcessInput, type ProcessItem } from "../../src/batch/process";
import { groupKeyOf, parseStatus, type Tracked } from "../../src/batch/status";
import { FakeDir, paintBlank, paintSquare, restoreCanvas, seedDir, seedFile, stubCanvasPaint, stubToBlobValue, treeOf } from "./fakes";

const NOW = new Date(2026, 8, 30, 14, 32, 8);
const NOW_ISO = "2026-10-01T07:00:00.000Z";
const SETTINGS = settingsOf(defaultPreset("t", NOW_ISO));

afterEach(() => restoreCanvas());

const fakeImg = () => ({ naturalWidth: 40, naturalHeight: 40 }) as HTMLImageElement;

function sourceTree(): { root: FakeDir; cat: FakeDir; out: FakeDir } {
  const root = new FakeDir("root");
  const cat = seedDir(root, "Cat");
  seedFile(cat, "icon.png", "REFBYTES");
  seedFile(cat, "icon_AI.png", "AIBYTES", "image/png", 11);
  const out = seedDir(root, "_split_output");
  return { root, cat, out };
}

function procItem(cat: FakeDir, name: string, withRef: boolean): ProcessItem {
  const dot = name.lastIndexOf(".");
  const refHandle = withRef ? (cat.files.get("icon.png") ?? null) : null;
  return {
    relPath: `Cat/${name}`,
    dir: "Cat",
    name,
    stem: name.slice(0, dot),
    handle: cat.files.get(name)!,
    refName: withRef ? "icon.png" : `missing for ${name}`,
    refFound: withRef,
    refHandle,
  };
}

const trackedOf = (item: ProcessItem): Tracked => ({ relPath: item.relPath, size: 7, mtime: 11, state: "unprocessed", lastSeen: NOW_ISO });

function inputOf(over: Partial<ProcessInput>, items: ProcessItem[], tracked: Tracked[], cat: FakeDir, out: FakeDir): ProcessInput {
  return {
    dirs: new Map([
      ["", cat],
      ["Cat", cat],
    ]),
    outputRoot: out,
    items,
    tracked,
    refs: new Map([[groupKeyOf({ dir: "Cat", base: "icon" }), { reference: "icon.png", referenceFound: true }]]),
    settings: SETTINGS,
    now: NOW,
    decode: async (_f: FsFile) => fakeImg(),
    onProgress: () => {},
    shouldAbort: () => false,
    ...over,
  };
}

describe("processBatch — happy path", () => {
  it("splits one icon into split_01, copies the reference, writes status", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["PNGDATA"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    const item = procItem(cat, "icon_AI.png", true);
    const progress: [number, number][] = [];
    const report = await processBatch(inputOf({ onProgress: (d, t) => progress.push([d, t]) }, [item], [trackedOf(item)], cat, out));
    expect(report.processed).toBe(1);
    expect(report.icons).toBe(1);
    expect(report.interrupted).toBe(false);
    expect(report.batchPath).toBe("2026-09/2026-09-30_14-32-08");
    expect(progress).toEqual([[1, 1]]);
    const tree = await treeOf(out);
    expect(tree).toContain("2026-09/2026-09-30_14-32-08/Cat/icon_AI/split_01/icon_AI_01.png");
    expect(tree).toContain("2026-09/2026-09-30_14-32-08/Cat/icon_AI/split_01/icon.png");
    const splitDir = (((out.dirs.get("2026-09")!.dirs.get("2026-09-30_14-32-08")! as FakeDir).dirs.get("Cat")! as FakeDir).dirs.get("icon_AI")! as FakeDir).dirs.get("split_01")! as FakeDir;
    expect(await readTextFile(splitDir, "icon_AI_01.png")).toBe("PNGDATA");
    expect(await readTextFile(splitDir, "icon.png")).toBe("REFBYTES");
    const status = parseStatus(JSON.parse((await readTextFile(cat, "icon.json"))!));
    expect(status?.images[0]).toMatchObject({ state: "processed", output: "Cat/icon_AI" });
  });
});

describe("processBatch — never overwrite (RULE 23)", () => {
  it("variates duplicate parent names and the batch folder itself", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    seedFile(cat, "icon_AI.jpg", "JPG", "image/jpeg", 12);
    const a = procItem(cat, "icon_AI.png", true);
    const b = procItem(cat, "icon_AI.jpg", true);
    const first = await processBatch(inputOf({}, [a], [trackedOf(a)], cat, out));
    expect(first.batchPath).toBe("2026-09/2026-09-30_14-32-08");
    const second = await processBatch(inputOf({}, [a, b], [trackedOf(a), trackedOf(b)], cat, out));
    expect(second.batchPath).toBe("2026-09/2026-09-30_14-32-08_v02");
    const tree = await treeOf(out);
    expect(tree).toContain("2026-09/2026-09-30_14-32-08_v02/Cat/icon_AI/split_01/icon_AI_01.png");
    expect(tree).toContain("2026-09/2026-09-30_14-32-08_v02/Cat/icon_AI_v02/split_01/icon_AI_v02_01.png");
    expect(tree).toContain("2026-09/2026-09-30_14-32-08/Cat/icon_AI/split_01/icon_AI_01.png");
  });
});

describe("processBatch — per-item isolation (RULE 5) and honest states (RULE 4)", () => {
  it("skips deleted files and continues the batch", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    seedFile(cat, "icon_AI_2.png", "B", "image/png", 12);
    const gone = procItem(cat, "icon_AI.png", true);
    const ok = procItem(cat, "icon_AI_2.png", true);
    cat.files.delete("icon_AI.png");
    const report = await processBatch(inputOf({}, [gone, ok], [trackedOf(gone), trackedOf(ok)], cat, out));
    expect(report.processed).toBe(1);
    expect(report.failed).toEqual([{ relPath: "Cat/icon_AI.png", reason: "deleted before processing" }]);
    expect(report.outcomes.find((o) => o.relPath === "Cat/icon_AI.png")?.state).toBe("deleted");
  });

  it("fails a decode error but still processes the rest", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    seedFile(cat, "icon_AI_2.png", "B", "image/png", 12);
    const bad = procItem(cat, "icon_AI.png", true);
    const ok = procItem(cat, "icon_AI_2.png", true);
    const decode = vi.fn(async (f: FsFile) => (f.name === "icon_AI.png" ? Promise.reject(new Error("boom")) : fakeImg()));
    const report = await processBatch(inputOf({ decode }, [bad, ok], [trackedOf(bad), trackedOf(ok)], cat, out));
    expect(report.processed).toBe(1);
    expect(report.failed).toEqual([{ relPath: "Cat/icon_AI.png", reason: "could not decode image" }]);
  });

  it("reports no-icons as skipped, not success", async () => {
    stubCanvasPaint(paintBlank);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    const item = procItem(cat, "icon_AI.png", true);
    const report = await processBatch(inputOf({}, [item], [trackedOf(item)], cat, out));
    expect(report.processed).toBe(0);
    expect(report.skipped).toEqual([{ relPath: "Cat/icon_AI.png", reason: "no icons detected" }]);
  });

  it("processes without a reference copy when the reference is missing", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    const item = procItem(cat, "icon_AI.png", false);
    const report = await processBatch(inputOf({}, [item], [trackedOf(item)], cat, out));
    expect(report.processed).toBe(1);
    expect(await treeOf(out)).not.toContain("2026-09/2026-09-30_14-32-08/Cat/icon_AI/split_01/icon.png");
  });

  it("fails closed when encoding yields nothing (RULE 15)", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(null);
    const { cat, out } = sourceTree();
    const item = procItem(cat, "icon_AI.png", true);
    const report = await processBatch(inputOf({}, [item], [trackedOf(item)], cat, out));
    expect(report.processed).toBe(0);
    expect(report.failed[0].reason).toContain("icon 1:");
  });
});

describe("processBatch — interruption (RULE 7)", () => {
  it("honours abort before and during the batch", async () => {
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { cat, out } = sourceTree();
    const item = procItem(cat, "icon_AI.png", true);
    const early = await processBatch(inputOf({ shouldAbort: () => true }, [item], [trackedOf(item)], cat, out));
    expect(early.interrupted).toBe(true);
    expect(early.processed).toBe(0);
    let calls = 0;
    const mid = await processBatch(
      inputOf({ shouldAbort: () => calls > 0, onProgress: () => calls++ }, [item, item], [trackedOf(item)], cat, out),
    );
    expect(mid.interrupted).toBe(true);
    expect(mid.processed).toBe(1);
  });
});
