// RULE 8 — flows run for real end to end: scan → reconcile → status files →
// process → reducer, over fake FS with real Files. Only the folder picker,
// Image decode and toBlob are faked. Deleting a flow step fails here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTextFile } from "../../src/batch/fs";
import { defaultPreset, settingsOf, writePreset } from "../../src/batch/presets";
import { batchReducer, initBatch, type BatchAction, type BatchItem, type BatchState } from "../../src/batch/reducer";
import { parseStatus } from "../../src/batch/status";
import { applyPreset, autoloadLastPreset } from "../../src/ui/batch/presetFlow";
import { runProcess } from "../../src/ui/batch/processFlow";
import { copyDisplayPath, pickDest, pickSource, runScan, type FlowCtx } from "../../src/ui/batch/scanFlow";
import { FakeDir, paintSquare, restoreCanvas, seedDir, seedFile, seedRealFile, stubCanvasPaint, stubToBlobValue } from "./fakes";

const NOW_ISO = "2026-10-01T07:00:00.000Z";

function tree(): { root: FakeDir; cat: FakeDir } {
  const root = new FakeDir("root");
  const cat = seedDir(root, "Cat");
  seedFile(cat, "icon.png", "REF");
  seedRealFile(cat, "icon_AI.png", "AI1");
  seedRealFile(cat, "solo_AI.png", "AI2");
  return { root, cat };
}

function stateWithSource(root: FakeDir): BatchState {
  const s = initBatch(settingsOf(defaultPreset("t", NOW_ISO)));
  return { ...s, folders: { ...s.folders, source: root, sourceName: "root" } };
}

function harness(state: BatchState) {
  let cur = state;
  const actions: BatchAction[] = [];
  const says: { msg: string; err: boolean }[] = [];
  const busy: (string | null)[] = [];
  const asked: BatchItem[][] = [];
  const ctx: FlowCtx = {
    snap: state,
    dispatch: (a) => {
      actions.push(a);
      cur = batchReducer(cur, a);
    },
    say: (msg, err = false) => says.push({ msg, err }),
    setBusy: (m) => busy.push(m),
    thumbs: { current: [] },
    abort: { current: false },
    onMissingRefs: (items) => asked.push(items),
  };
  return { ctx, actions, says, busy, asked, getState: () => cur };
}

function stubImage() {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 40;
      naturalHeight = 30;
      onload: (() => void) | null = null;
      set src(_u: string) {
        this.onload?.();
      }
    },
  );
}

beforeEach(() => {
  localStorage.removeItem("iconsplitter.presets.v1");
  localStorage.removeItem("iconsplitter.preset.last.v1");
});

afterEach(() => {
  restoreCanvas();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  localStorage.removeItem("iconsplitter.presets.v1");
  localStorage.removeItem("iconsplitter.preset.last.v1");
});

describe("runScan", () => {
  it("requires a source folder (honest, not silent)", async () => {
    const h = harness(initBatch(settingsOf(defaultPreset("t", NOW_ISO))));
    await expect(runScan(h.ctx)).resolves.toBeNull();
    expect(h.says).toEqual([{ msg: "Choose a source folder first", err: true }]);
    expect(h.actions).toEqual([]);
  });

  it("scans, links references, selects new items, writes status files", async () => {
    const { root, cat } = tree();
    const h = harness(stateWithSource(root));
    const applied = await runScan(h.ctx);
    expect(applied?.items).toHaveLength(2);
    expect(h.getState().selected.sort()).toEqual(["Cat/icon_AI.png", "Cat/solo_AI.png"]);
    const icon = applied!.items.find((i) => i.name === "icon_AI.png")!;
    expect(icon).toMatchObject({ referenceFound: true, referenceName: "icon.png", state: "unprocessed" });
    expect(icon.thumbUrl).toMatch(/^blob:/);
    const solo = applied!.items.find((i) => i.name === "solo_AI.png")!;
    expect(solo).toMatchObject({ referenceFound: false, referenceName: "solo.png" });
    expect(h.says[0].msg).toContain("2 eligible images");
    expect(h.busy[h.busy.length - 1]).toBeNull();
    const status = parseStatus(JSON.parse((await readTextFile(cat, "icon.json"))!));
    expect(status?.images.map((t) => t.relPath)).toEqual(["Cat/icon_AI.png"]);
  });

  it("distinguishes no-images from no-eligible-images (RULE 4)", async () => {
    const empty = new FakeDir("empty");
    const h1 = harness(stateWithSource(empty));
    await runScan(h1.ctx);
    expect(h1.says[0]).toMatchObject({ msg: "No images found in this folder", err: true });
    const root = new FakeDir("root");
    seedFile(root, "plain.png", "x");
    const h2 = harness(stateWithSource(root));
    await runScan(h2.ctx);
    expect(h2.says[0]).toMatchObject({ msg: "No eligible _AI images found", err: true });
  });
});

describe("runProcess", () => {
  it("asks about missing references first, then honours Skip", async () => {
    stubImage();
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { root } = tree();
    const h1 = harness(stateWithSource(root));
    await runScan(h1.ctx);
    const h2 = harness(h1.getState());
    await runProcess(h2.ctx, null);
    expect(h2.asked).toHaveLength(1);
    expect(h2.asked[0].map((i) => i.relPath)).toEqual(["Cat/solo_AI.png"]);
    const h3 = harness(h2.getState());
    await runProcess(h3.ctx, false);
    expect(h3.says[h3.says.length - 1].msg).toContain("1 processed");
    expect(h3.getState().items.find((i) => i.name === "icon_AI.png")?.state).toBe("processed");
    expect(h3.getState().items.find((i) => i.name === "solo_AI.png")?.state).toBe("unprocessed");
  });

  it("rescan-before-process drops files deleted after scanning (spec §6)", async () => {
    stubImage();
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { root, cat } = tree();
    seedRealFile(cat, "doomed_AI.png", "D");
    const h1 = harness(stateWithSource(root));
    await runScan(h1.ctx);
    expect(h1.getState().selected).toHaveLength(3);
    cat.files.delete("doomed_AI.png");
    const h2 = harness(h1.getState());
    await runProcess(h2.ctx, true);
    const done = h2.getState();
    expect(done.items.find((i) => i.name === "doomed_AI.png")?.state).toBe("missing");
    expect(done.selected).not.toContain("Cat/doomed_AI.png");
    expect(h2.says[h2.says.length - 1].msg).toContain("2 processed");
  });
});

describe("presets in flows", () => {
  it("applyPreset and autoloadLastPreset restore settings + folder names", () => {
    writePreset({ ...defaultPreset("work", NOW_ISO), sourceName: "S", destName: "D", useCustomDest: true });
    const h = harness(initBatch(settingsOf(defaultPreset("t", NOW_ISO))));
    autoloadLastPreset(h.ctx.dispatch, h.ctx.say);
    expect(h.actions.map((a) => a.type)).toEqual(["settings-set", "folders-meta"]);
    expect(h.getState().folders).toMatchObject({ sourceName: "S", destName: "D", useCustomDest: true });
    expect(h.says[0].msg).toContain("work");
    const h2 = harness(initBatch(settingsOf(defaultPreset("t", NOW_ISO))));
    localStorage.removeItem("iconsplitter.preset.last.v1");
    autoloadLastPreset(h2.ctx.dispatch, h2.ctx.say);
    expect(h2.actions).toEqual([]);
    applyPreset(h2.ctx.dispatch, h2.ctx.say, defaultPreset("x", NOW_ISO));
    expect(h2.actions).toHaveLength(2);
  });
});

describe("pickers and path copy", () => {
  it("pickSource scans the picked folder; pickDest stores the handle", async () => {
    const { root } = tree();
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => root;
    const h = harness(initBatch(settingsOf(defaultPreset("t", NOW_ISO))));
    await pickSource(h.ctx);
    expect(h.getState().folders.sourceName).toBe("root");
    expect(h.getState().items).toHaveLength(2);
    const dest = new FakeDir("dest");
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => dest;
    await pickDest(h.ctx);
    expect(h.getState().folders.destName).toBe("dest");
  });

  it("pickers fail open without the API (RULE 9)", async () => {
    const h = harness(initBatch(settingsOf(defaultPreset("t", NOW_ISO))));
    await pickSource(h.ctx);
    await pickDest(h.ctx);
    expect(h.says).toEqual([
      { msg: "Folder picking needs Chrome or Edge", err: true },
      { msg: "Folder picking needs Chrome or Edge", err: true },
    ]);
  });

  it("copyDisplayPath copies root + relPath, or shows it when blocked", async () => {
    const { root } = tree();
    const h = harness(stateWithSource(root));
    const applied = await runScan(h.ctx);
    const item = applied!.items[0];
    const writeText = vi.fn(async (_s: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await copyDisplayPath(item, "root", h.ctx.say);
    expect(writeText).toHaveBeenCalledWith(`root/${item.relPath}`);
    expect(h.says[h.says.length - 1].msg).toContain("Path copied");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("blocked"); } }, configurable: true });
    await copyDisplayPath(item, "root", h.ctx.say);
    expect(h.says[h.says.length - 1]).toMatchObject({ err: true });
    expect(h.says[h.says.length - 1].msg).toContain(`root/${item.relPath}`);
  });
});
