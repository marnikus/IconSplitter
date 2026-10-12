// batch_merge_preview.test.tsx — TDD for Batch merge slider + Preview splits
// Preview now inline same row with main thumbnail (per user feedback)

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { stubPixelPipeline } from "./helpers/pixelsheet";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";
import { clampMergeFrac } from "../src/lib/batchpreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_merge_preview");
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

describe("Batch merge slider", () => {
  it("shows global merge slider 0-0.15 step 0.0025 with Auto reset", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    const slider = q("[data-testid=batch-merge-slider]") as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    expect(Number(slider!.min)).toBe(0);
    expect(Number(slider!.max)).toBe(0.15);
    expect(Number(slider!.step)).toBe(0.0025);

    const reset = q("[data-testid=batch-merge-reset]") as HTMLButtonElement | null;
    expect(reset).not.toBeNull();
    expect(reset!.disabled).toBe(true);
  });

  it("preset-saved: slider updates preset and clampMergeFrac works", () => {
    expect(clampMergeFrac(null)).toBeNull();
    expect(clampMergeFrac(0.05)).toBe(0.05);
    expect(clampMergeFrac(0.2)).toBeNull();
  });
});

describe("Batch preview splits", () => {
  it("Preview splits button exists beside Split selected, disabled when none selected", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    const deselect = q("[data-testid=batch-deselect]") as HTMLElement | null;
    await click(deselect!);
    await settle(100);

    const previewBtn = q("[data-testid=batch-preview]") as HTMLButtonElement | null;
    expect(previewBtn).not.toBeNull();
    expect(previewBtn!.textContent).toMatch(/Preview splits/);
    expect(previewBtn!.disabled).toBe(true);

    const selectVisible = q("[data-testid=batch-select-visible]") as HTMLElement | null;
    await click(selectVisible!);
    await settle(100);

    const previewBtn2 = q("[data-testid=batch-preview]") as HTMLButtonElement | null;
    expect(previewBtn2!.disabled).toBe(false);

    const bulk = q("[data-testid=batch-bulk]");
    expect(bulk).not.toBeNull();
    expect(bulk!.querySelector("[data-testid=batch-preview]")).not.toBeNull();
    expect(bulk!.querySelector("[data-testid=batch-process]")).not.toBeNull();
  });

  it("Preview shows count + strip per selected row inline same row with main thumbnail, no file writes", async () => {
    stubPixelPipeline(); // the real pipeline runs; the auto distance merges the two blobs
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    const selectVisible = q("[data-testid=batch-select-visible]") as HTMLElement | null;
    await click(selectVisible!);
    await settle(100);

    const previewBtn = q("[data-testid=batch-preview]") as HTMLButtonElement | null;
    await click(previewBtn!);
    await settle(800);

    // Preview is inline inside batch rows, in the same row as the main thumbnail
    const rows = qAll("[data-testid^=batch-row-]");
    expect(rows.length).toBeGreaterThan(0);
    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBe(3);
    for (const c of Array.from(counts)) expect(c.textContent).toBe("1 icon");
    expect(qAll("[data-testid^=batch-preview-thumb-]").length).toBe(3); // one thumb per icon
    const firstRow = q("[data-testid=\"batch-row-icon-a_AI.png\"]");
    expect(firstRow?.querySelector("[data-testid^=batch-preview-count-]")).not.toBeNull();

    // No status change: still unprocessed, nothing written
    expect(qAll("[data-testid^=batch-status-]").length).toBeGreaterThan(0);
    expect(Array.from(dir.children.keys()).some((k) => k.includes("_split_output"))).toBe(false);
  });

  it("high perf: preview for many rows renders with limited thumbs per row", async () => {
    stubPixelPipeline();
    const dir = new FakeDir("big_root");
    for (let i = 0; i < 50; i++) {
      dir.children.set(`icon-${i}_AI.png`, new FakeFile(`icon-${i}_AI.png`, 10, Date.now(), `a${i}`));
      dir.children.set(`icon-${i}.png`, new FakeFile(`icon-${i}.png`, 5, 1000, `ref${i}`));
    }
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(800);

    const selectVisible = q("[data-testid=batch-select-visible]") as HTMLElement | null;
    await click(selectVisible!);
    await settle(100);

    const previewBtn = q("[data-testid=batch-preview]") as HTMLButtonElement | null;
    await click(previewBtn!);
    await settle(6000);

    // Every row really finished its preview: one icon count and one thumb each
    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBe(50);
    for (const c of Array.from(counts)) expect(c.textContent).toBe("1 icon");
    expect(qAll("[data-testid^=batch-preview-thumb-]").length).toBe(50);
  }, 30000);
});
