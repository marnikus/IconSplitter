// batch_row_locate.test.tsx — after a run, a processed row shows a Location
// button that copies the folder holding the item's split icons (user report
// 2026-10-15). Covers the honest base rules (copypath), the outRel data chain
// (process -> finalize -> Row) and the button + clipboard + toast behaviour.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { setImageDecodeTimeout } from "../src/lib/dom";
import { splitOutputBase } from "../src/lib/copypath";
import { processItems, type BatchItem } from "../src/batch/process";
import BatchPanel from "../src/batch/BatchPanel";

const SPLIT = { padding: 6, size: 0, transparent: false, mergeFrac: null };
const date = new Date(2026, 8, 30, 14, 32, 8);

vi.mock("../src/lib/batchsplit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/batchsplit")>();
  return {
    ...actual,
    splitSheet: async () => [new Blob(["1"]), new Blob(["2"]), new Blob(["3"]), new Blob(["4"])],
  };
});
vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return { ...actual, loadSheet: async () => ({ naturalWidth: 100, naturalHeight: 100 }) };
});

describe("splitOutputBase — the honest base of a copied split folder", () => {
  beforeEach(() => clearKnownRoots());
  afterEach(() => clearKnownRoots());

  it("custom dest with a bound path wins as-is", () => {
    const dest = new FakeDir("Dests");
    rememberKnownRoot(dest, "F:\\Icons\\Out");
    expect(splitOutputBase(dest, new FakeDir("Root"))).toBe("F:\\Icons\\Out");
  });

  it("custom dest without a bound path falls back to its own name", () => {
    expect(splitOutputBase(new FakeDir("MyDest"), new FakeDir("Root"))).toBe("MyDest");
  });

  it("auto mode: the root's path (or name) plus _split_output", () => {
    const root = new FakeDir("Root");
    rememberKnownRoot(root, "F:\\Icons");
    expect(splitOutputBase(null, root)).toBe("F:\\Icons\\_split_output");
    expect(splitOutputBase(new FakeDir("_split_output"), new FakeDir("size_root"))).toBe("size_root\\_split_output");
  });

  it("no handles at all degrade to the layout constant alone", () => {
    expect(splitOutputBase(null, null)).toBe("_split_output");
  });
});

describe("processItems — outRel marks where the splits were written", () => {
  function item(relPath: string, ref: string | null): BatchItem {
    const relDir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
    const name = relPath.split("/").pop()!;
    return {
      source: { relPath, name, relDir, refRelPath: ref },
      file: new FakeFile(name),
      refFile: ref ? new FakeFile(ref.split("/").pop()!) : null,
    };
  }
  const twoBlobs = async () => [new Blob(["a"]), new Blob(["b"]), new Blob(["c"]), new Blob(["d"])];

  it("a processed item reports its output folder relative to dest", async () => {
    const report = await processItems([item("Category-A/icon_AI.png", null)], { dest: new FakeDir("out"), split: SPLIT, splitImage: twoBlobs, now: date });
    expect(report.results[0].outcome).toBe("processed");
    expect(report.results[0].outRel).toBe("2026-09/2026-09-30/Category-A/icon_AI");
  });

  it("a skipped item wrote nothing, so it has no output folder", async () => {
    const report = await processItems([item("a/x_AI.png", null)], { dest: new FakeDir("out"), split: SPLIT, splitImage: async () => [], now: date });
    expect(report.results[0].outcome).toBe("skipped");
    expect(report.results[0].outRel).toBe("");
  });
});

describe("Location button on a processed row", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);

  const written: string[] = [];

  type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };
  let host: HTMLDivElement;
  let ui: Root;
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
  const settle = async (ms = 80) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
  const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

  beforeEach(async () => {
    setImageDecodeTimeout(25);
    localStorage.clear();
    await dropDb();
    clearKnownRoots();
    vi.clearAllMocks();
    written.length = 0;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
    const root = new FakeDir("size_root");
    root.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 10, Date.now(), "a"));
    root.children.set("icon-a.png", new FakeFile("icon-a.png", 5, 1000, "ref"));
    (window as unknown as PickerWindow).showDirectoryPicker = async () => root;
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
    await act(async () => { ui.render(<BatchPanel />); });
    await settle(100);
    await click(q("[data-testid=batch-open-folder]")!);
    await settle(400);
    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);
  });

  afterEach(async () => {
    await act(async () => ui.unmount());
    host.remove();
    setImageDecodeTimeout(8000);
    vi.unstubAllGlobals();
  });

  const locateBtn = () => q("[data-testid='batch-row-locate-icon-a_AI.png']");

  it("no Location button before anything was processed", () => {
    expect(locateBtn()).toBeNull();
  });

  it("after the split run the processed row shows it; clicking copies the split folder and says so", async () => {
    await click(q("[data-testid=batch-approve-selected]")!);
    await settle(300);
    await click(q("[data-testid=batch-process]")!);
    await settle(900);
    const btn = locateBtn();
    expect(btn).not.toBeNull();
    await click(btn!);
    await settle(100);
    expect(written).toHaveLength(1);
    expect(written[0].startsWith("size_root\\_split_output\\")).toBe(true);
    expect(written[0].endsWith("\\icon-a_AI")).toBe(true);
    expect(q("[data-testid=batch-toast]")?.textContent ?? "").toMatch(/copied/i);
  });
});
