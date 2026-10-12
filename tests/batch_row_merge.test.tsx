// batch_row_merge.test.tsx — TDD for the per-row merge override (Batch only):
// the override itself, the Detection bar that sets it (live value, one line, no
// wrap) and the row's OWN preview the moment Apply/Reset is clicked (2026-10-13).
// The preview and split tests run the real pipeline — analyze → detect → render —
// over synthetic pixels; only the browser APIs (Image, canvas, blob) are stubbed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { stubPixelPipeline } from "./helpers/pixelsheet";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";
import { clampMergeFrac, effectiveMerge, mergeForRow } from "../src/lib/batchpreview";
import { splitWithOverride } from "../src/batch/batchOps";
import type { BatchItem } from "../src/batch/process";
import type { Preset } from "../src/lib/presets";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_row_merge");
  root.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 10, Date.now(), "a"));
  root.children.set("icon-a.png", new FakeFile("icon-a.png", 5, 1000, "ref"));
  root.children.set("icon-b_AI.png", new FakeFile("icon-b_AI.png", 10, Date.now(), "b"));
  root.children.set("icon-b.png", new FakeFile("icon-b.png", 5, 1000, "ref"));
  root.children.set("icon-c_AI.png", new FakeFile("icon-c_AI.png", 10, Date.now(), "c"));
  root.children.set("icon-c.png", new FakeFile("icon-c.png", 5, 1000, "ref"));
  return root;
}

let host: HTMLDivElement;
let root: Root;

async function mount(dir?: FakeDir) {
  if (dir) {
    (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<BatchPanel />);
  });
  return host;
}

function q(sel: string): Element | null {
  return host.querySelector(sel);
}
function qAll(sel: string): NodeListOf<Element> {
  return host.querySelectorAll(sel);
}
async function settle(ms = 80) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}
/** Drags a range input the way a browser does: value set, then input + change. */
async function dragSlider(el: HTMLInputElement | null, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
    el?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const slider = (name: string) => q(`[data-testid="batch-row-merge-slider-${name}"]`) as HTMLInputElement | null;
const labelOf = (name: string) => q(`[data-testid="batch-row-merge-label-${name}"]`)?.textContent ?? "";
const applyBtn = (name: string) => q(`[data-testid="batch-row-merge-apply-${name}"]`) as HTMLButtonElement | null;
const resetBtn = (name: string) => q(`[data-testid="batch-row-merge-reset-${name}"]`) as HTMLButtonElement | null;
const countOf = (name: string) => q(`[data-testid="batch-preview-count-${name}"]`)?.textContent ?? "(no preview)";

async function openFolder(dir: FakeDir) {
  await mount(dir);
  await settle(100);
  await click(q("[data-testid=batch-open-folder]")!);
  await settle(600);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.removeItem(BATCH_PREFS_KEY);
  await dropDb();
  clearKnownRoots();
  vi.restoreAllMocks();
  if (host) {
    await act(async () => root.unmount());
    host.remove();
  }
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Batch per-row merge override", () => {
  it("shows per-row Detection bar with same params 0-0.15 step 0.0025 and Apply/Reset", async () => {
    await openFolder(makeBatchRoot());

    const bars = qAll("[data-testid^=batch-row-merge-bar-]");
    expect(bars.length).toBeGreaterThanOrEqual(3);

    const sliders = qAll("[data-testid^=batch-row-merge-slider-]");
    expect(sliders.length).toBeGreaterThanOrEqual(3);
    for (const s of Array.from(sliders) as HTMLInputElement[]) {
      expect(Number(s.min)).toBe(0);
      expect(Number(s.max)).toBe(0.15);
      expect(Number(s.step)).toBe(0.0025);
    }

    const applyBtns = qAll("[data-testid^=batch-row-merge-apply-]");
    const resetBtns = qAll("[data-testid^=batch-row-merge-reset-]");
    expect(applyBtns.length).toBeGreaterThanOrEqual(3);
    expect(resetBtns.length).toBeGreaterThanOrEqual(3);

    // Initially no override, reset disabled
    for (const r of Array.from(resetBtns) as HTMLButtonElement[]) {
      expect(r.disabled).toBe(true);
    }
  });

  it("Apply overrides only that row, Reset fallback to global", async () => {
    await openFolder(makeBatchRoot());

    const firstRowPath = "icon-a_AI.png";
    expect(slider(firstRowPath)).not.toBeNull();
    expect(applyBtn(firstRowPath)).not.toBeNull();
    expect(resetBtn(firstRowPath)).not.toBeNull();

    await dragSlider(slider(firstRowPath), "0.05");
    await settle(50);
    await click(applyBtn(firstRowPath)!);
    await settle(250);

    expect(labelOf(firstRowPath)).toMatch(/overridden/);
    expect(labelOf(firstRowPath)).toMatch(/0\.0500/);
    expect(resetBtn(firstRowPath)!.disabled).toBe(false);

    // Other row should NOT be overridden
    expect(labelOf("icon-b_AI.png")).not.toMatch(/overridden/);

    // Reset clears override
    await click(resetBtn(firstRowPath)!);
    await settle(200);
    expect(labelOf(firstRowPath)).not.toMatch(/overridden/);
    expect(resetBtn(firstRowPath)!.disabled).toBe(true);
  });

  it("shows the slider's own value live, and whether it is applied (RULE 24)", async () => {
    await openFolder(makeBatchRoot());
    expect(labelOf("icon-a_AI.png")).toBe("auto");
    expect(applyBtn("icon-a_AI.png")!.disabled).toBe(true); // nothing to apply yet

    await dragSlider(slider("icon-a_AI.png"), "0.0325");
    expect(labelOf("icon-a_AI.png")).toBe("0.0325 · not applied");
    expect(applyBtn("icon-a_AI.png")!.disabled).toBe(false);

    await click(applyBtn("icon-a_AI.png")!);
    await settle(200);
    expect(labelOf("icon-a_AI.png")).toBe("0.0325 · overridden");
    expect(applyBtn("icon-a_AI.png")!.disabled).toBe(true);

    // A drag that was never applied is dropped by Reset — the number follows the truth
    await dragSlider(slider("icon-a_AI.png"), "0.05");
    expect(labelOf("icon-a_AI.png")).toBe("0.0500 · not applied");
    await click(resetBtn("icon-a_AI.png")!);
    await settle(200);
    expect(labelOf("icon-a_AI.png")).toBe("auto");
  });

  it("Apply previews THAT row at once, at the applied distance, and leaves the others alone", async () => {
    stubPixelPipeline();
    const dir = makeBatchRoot();
    await openFolder(dir);
    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);
    await click(q("[data-testid=batch-preview]")!);
    await settle(500);
    // the global distance is auto: every sheet's two blobs merge into ONE icon
    expect(countOf("icon-a_AI.png")).toBe("1 icon");
    expect(countOf("icon-b_AI.png")).toBe("1 icon");

    await dragSlider(slider("icon-a_AI.png"), "0.0025");
    await click(applyBtn("icon-a_AI.png")!);
    await settle(500);
    expect(countOf("icon-a_AI.png")).toBe("2 icons"); // its own distance, right away
    expect(countOf("icon-b_AI.png")).toBe("1 icon"); // untouched: never re-run, never wiped
    expect(countOf("icon-c_AI.png")).toBe("1 icon");

    await click(resetBtn("icon-a_AI.png")!);
    await settle(500);
    expect(countOf("icon-a_AI.png")).toBe("1 icon"); // back on the global distance
    expect(Array.from(dir.children.keys()).some((k) => k.includes("_split_output"))).toBe(false);
  });

  it("Apply on a row nobody previewed yet still shows that row's split", async () => {
    stubPixelPipeline();
    await openFolder(makeBatchRoot());
    expect(countOf("icon-a_AI.png")).toBe("(no preview)");

    await dragSlider(slider("icon-a_AI.png"), "0.0025");
    await click(applyBtn("icon-a_AI.png")!);
    await settle(500);
    expect(countOf("icon-a_AI.png")).toBe("2 icons");
    expect(countOf("icon-b_AI.png")).toBe("(no preview)"); // no global run was needed
  });

  it("processing splits each row with its own override, the global distance otherwise", async () => {
    stubPixelPipeline();
    const globalSplit = { mergeFrac: null, padding: 0, size: 0, transparent: false } as Preset["split"];
    const merges = { "icon-a_ai.png": 0.0025 };
    const itemsFor = (name: string) =>
      [{ source: { relPath: name, name, relDir: "", refRelPath: null } }] as unknown as BatchItem[];
    const file = (name: string) => new File(["x"], name, { type: "image/png" });

    expect(await splitWithOverride(file("icon-a_AI.png"), globalSplit, merges, itemsFor("icon-a_AI.png"))).toHaveLength(2);
    expect(await splitWithOverride(file("icon-b_AI.png"), globalSplit, merges, itemsFor("icon-b_AI.png"))).toHaveLength(1);
  });

  it("high perf: 1000 rows renders per-row controls without crash", async () => {
    const dir = new FakeDir("big_row_merge");
    for (let i = 0; i < 1000; i++) {
      dir.children.set(`icon-${i}_AI.png`, new FakeFile(`icon-${i}_AI.png`, 10, Date.now(), `a${i}`));
      dir.children.set(`icon-${i}.png`, new FakeFile(`icon-${i}.png`, 5, 1000, `ref${i}`));
    }
    await openFolder(dir);
    await settle(2000);

    expect(qAll("[data-testid^=batch-row-merge-bar-]").length).toBeGreaterThan(0);
    expect(qAll("[data-testid^=batch-row-merge-slider-]").length).toBeGreaterThan(0);

    await click(q("[data-testid=batch-select-visible]")!);
    await settle(300);
    expect(qAll("[data-testid^=batch-row-merge-bar-]").length).toBeGreaterThan(0);
  }, 20000);

  it("preview uses per-row override without file writes", async () => {
    const dir = makeBatchRoot();
    await openFolder(dir);
    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);

    await dragSlider(slider("icon-a_AI.png"), "0.07");
    await click(applyBtn("icon-a_AI.png")!);
    await settle(200);

    await click(q("[data-testid=batch-preview]")!);
    await settle(1000);
    expect(qAll("[data-testid^=batch-preview-count-]").length).toBeGreaterThan(0);

    // No file writes: fake fs has no _split_output
    expect(Array.from(dir.children.keys()).some((k) => k.includes("_split_output"))).toBe(false);
  });
});

describe("Batch Detection bar — layout and pure rules", () => {
  const cssSheet = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

  /** Every `{…}` body whose selector text contains `needle` (breakpoint rules included). */
  function rules(sheet: string, needle: string): string[] {
    return [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(needle)).map((m) => m[2]);
  }

  function declValues(bodies: string[], prop: string): string[] {
    return bodies
      .flatMap((b) => b.split(";"))
      .map((d) => d.trim())
      .filter((d) => d.startsWith(`${prop}:`))
      .map((d) => d.slice(prop.length + 1).trim());
  }

  it("the Detection column is floored by ONE token and the bar cannot wrap", () => {
    const sheet = cssSheet();
    const templates = rules(sheet, ".batch-row").flatMap((body) => declValues([body], "grid-template-columns"));
    expect(templates.length).toBeGreaterThanOrEqual(2); // the base rule + the ≤1360 px breakpoint
    for (const t of templates) {
      const tracks = t.replace(/!important/g, "").replace(/,\s+/g, ",").trim().split(/\s+/);
      expect(tracks).toHaveLength(8);
      expect(tracks[3]).toBe("minmax(var(--batch-detect-col),max-content)"); // the Detection track
    }
    expect(Number(sheet.match(/--batch-detect-col:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(360);

    const bar = rules(sheet, ".batch-merge-bar").join("\n");
    expect(bar).toMatch(/display:\s*grid/); // a grid never wraps its tracks
    expect(bar).not.toMatch(/flex-wrap/);
  });

  it("mergeForRow: an explicit value (the Apply click) beats map and global", () => {
    const merges = { "icon-a_ai.png": 0.08, "icon-b_ai.png": null };
    expect(mergeForRow(0.02, merges, "icon-a_AI.png", 0.05)).toBe(0.05);
    expect(mergeForRow(0.02, merges, "icon-a_AI.png", null)).toBeNull();
    expect(mergeForRow(0.02, merges, "Icon-A_AI.png")).toBe(0.08);
    expect(mergeForRow(0.02, merges, "ICON-B_AI.PNG")).toBeNull();
    expect(mergeForRow(0.02, merges, "icon-c_AI.png")).toBe(0.02);
  });

  it("effectiveMerge: override wins, null override means auto, clamps stay honest", () => {
    expect(effectiveMerge(0.02, 0.05, true)).toBe(0.05);
    expect(effectiveMerge(0.02, null, true)).toBeNull();
    expect(effectiveMerge(0.02, undefined, false)).toBe(0.02);
    expect(clampMergeFrac(0.08)).toBe(0.08);
    expect(clampMergeFrac(0.2)).toBeNull();
  });
});
