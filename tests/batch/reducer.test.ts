// RULE 8 — review-state reducer runs for real: selection can never hold
// missing items, deselection never deletes scan data. Fails if inverted.
import { describe, expect, it } from "vitest";
import { defaultPreset, settingsOf } from "../../src/batch/presets";
import {
  batchReducer,
  initBatch,
  isEligible,
  selectedItems,
  type BatchItem,
  type BatchState,
} from "../../src/batch/reducer";
import type { TrackState } from "../../src/batch/status";
import { FakeDir, FakeFile, seedFile } from "./fakes";

const NOW = "2026-10-01T07:00:00.000Z";
const SETTINGS = settingsOf(defaultPreset("t", NOW));
const shared = new FakeDir("shared");

function mkItem(relPath: string, state: TrackState = "unprocessed"): BatchItem {
  const slash = relPath.lastIndexOf("/");
  const dir = slash < 0 ? "" : relPath.slice(0, slash);
  const name = slash < 0 ? relPath : relPath.slice(slash + 1);
  const handle = seedFile(shared, `${dir.replace("/", "_")}_${name}`, "x");
  const source = { relPath, dir, name, size: 1, mtime: 7, handle, file: new FakeFile(name, "image/png", new Uint8Array([1]), 7) };
  return { relPath, dir, name, size: 1, mtime: 7, state, referenceName: "r.png", referenceFound: true, thumbUrl: null, source };
}

const stateWith = (items: BatchItem[], selected: string[]): BatchState => ({
  ...initBatch(SETTINGS),
  items,
  selected,
});

describe("initBatch", () => {
  it("starts empty, keeping the given settings", () => {
    const s = initBatch(SETTINGS);
    expect(s.items).toEqual([]);
    expect(s.selected).toEqual([]);
    expect(s.settings).toBe(SETTINGS);
    expect(s.folders.source).toBeNull();
  });
});

describe("scan-applied", () => {
  it("stores items and keeps only eligible, present selections (RULE 6)", () => {
    const items = [mkItem("a_AI.png"), mkItem("b_AI.png", "missing")];
    const s = batchReducer(initBatch(SETTINGS), { type: "scan-applied", items, selected: ["a_AI.png", "b_AI.png", "ghost.png"] });
    expect(s.items).toHaveLength(2);
    expect(s.selected).toEqual(["a_AI.png"]);
  });
});

describe("toggle / select-all / deselect-all", () => {
  it("toggles eligible items and ignores missing, deleted and unknown paths", () => {
    let s = stateWith([mkItem("a_AI.png"), mkItem("b_AI.png", "missing"), mkItem("c_AI.png", "deleted")], []);
    s = batchReducer(s, { type: "toggle", relPath: "a_AI.png" });
    expect(s.selected).toEqual(["a_AI.png"]);
    s = batchReducer(s, { type: "toggle", relPath: "b_AI.png" });
    s = batchReducer(s, { type: "toggle", relPath: "c_AI.png" });
    s = batchReducer(s, { type: "toggle", relPath: "ghost.png" });
    expect(s.selected).toEqual(["a_AI.png"]);
    s = batchReducer(s, { type: "toggle", relPath: "a_AI.png" });
    expect(s.selected).toEqual([]);
  });

  it("select-all takes eligible only; deselect-all clears without deleting items", () => {
    let s = stateWith([mkItem("a_AI.png"), mkItem("b_AI.png", "missing")], []);
    s = batchReducer(s, { type: "select-all" });
    expect(s.selected).toEqual(["a_AI.png"]);
    s = batchReducer(s, { type: "deselect-all" });
    expect(s.selected).toEqual([]);
    expect(s.items).toHaveLength(2);
  });
});

describe("item-patched", () => {
  it("updates fields and drops newly-missing items from selection", () => {
    let s = stateWith([mkItem("a_AI.png")], ["a_AI.png"]);
    s = batchReducer(s, { type: "item-patched", relPath: "a_AI.png", patch: { state: "processed", note: "done" } });
    expect(s.items[0]).toMatchObject({ state: "processed", note: "done" });
    expect(s.selected).toEqual(["a_AI.png"]);
    s = batchReducer(s, { type: "item-patched", relPath: "a_AI.png", patch: { state: "missing" } });
    expect(s.selected).toEqual([]);
    s = batchReducer(s, { type: "item-patched", relPath: "ghost.png", patch: { state: "processed" } });
    expect(s.items).toHaveLength(1);
  });
});

describe("settings-set / folders", () => {
  it("replaces settings wholesale", () => {
    const next = { ...SETTINGS, split: { ...SETTINGS.split, padding: 10 } };
    const s = batchReducer(initBatch(SETTINGS), { type: "settings-set", settings: next });
    expect(s.settings.split.padding).toBe(10);
  });

  it("stores source, dest and dest-mode", () => {
    const src = new FakeDir("src");
    const dst = new FakeDir("dst");
    let s = initBatch(SETTINGS);
    s = batchReducer(s, { type: "source-set", handle: src, name: "src" });
    s = batchReducer(s, { type: "dest-set", handle: dst, name: "dst" });
    s = batchReducer(s, { type: "dest-mode", useCustom: true });
    expect(s.folders).toMatchObject({ sourceName: "src", destName: "dst", useCustomDest: true });
    expect(s.folders.source).toBe(src);
    s = batchReducer(s, { type: "folders-meta", sourceName: "S", destName: "D", useCustomDest: false });
    expect(s.folders).toMatchObject({ sourceName: "S", destName: "D", useCustomDest: false });
    expect(s.folders.source).toBe(src);
  });
});

describe("selectors", () => {
  it("isEligible and selectedItems agree", () => {
    const items = [mkItem("a_AI.png"), mkItem("b_AI.png", "deleted")];
    expect(items.map(isEligible)).toEqual([true, false]);
    expect(selectedItems(stateWith(items, ["a_AI.png", "ghost.png"])).map((i) => i.relPath)).toEqual(["a_AI.png"]);
  });
});
