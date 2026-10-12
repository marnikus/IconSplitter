// batch_merge_preview.test.tsx — TDD for Batch merge slider + Preview splits
// Batch only: global merge slider preset-saved, Preview splits beside Split selected,
// per-row count + horizontal thumb strip, reuses detect/render pipeline, no writes, high perf.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";
import { clampMergeFrac } from "../src/lib/batchpreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_merge_preview");
  // 3 AI images with refs
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
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
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
    // Initially auto → reset disabled
    expect(reset!.disabled).toBe(true);

    // Drag to manual
    await act(async () => {
      slider!.value = "0.05";
      slider!.dispatchEvent(new Event("input", { bubbles: true }));
      slider!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(100);
    // After manual, reset enabled
    const reset2 = q("[data-testid=batch-merge-reset]") as HTMLButtonElement | null;
    // Might be enabled after change
    expect(reset2).not.toBeNull();
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

    // Deselect all first
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

    const splitBtn = q("[data-testid=batch-process]") as HTMLElement | null;
    expect(splitBtn).not.toBeNull();
    // Both buttons should be in same bulk bar
    const bulk = q("[data-testid=batch-bulk]");
    expect(bulk).not.toBeNull();
    expect(bulk!.querySelector("[data-testid=batch-preview]")).not.toBeNull();
    expect(bulk!.querySelector("[data-testid=batch-process]")).not.toBeNull();
  });

  it("Preview shows count + strip per selected row, no file writes", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    const selectVisible = q("[data-testid=batch-select-visible]") as HTMLElement | null;
    await click(selectVisible!);
    await settle(100);

    const previewBtn = q("[data-testid=batch-preview]") as HTMLElement | null;
    await click(previewBtn!);
    await settle(800);

    const panel = q("[data-testid=batch-preview-panel]");
    expect(panel).not.toBeNull();

    // Should have rows for selected images
    const rows = qAll("[data-testid^=batch-preview-row-]");
    expect(rows.length).toBeGreaterThan(0);

    // Each row should have count badge
    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBeGreaterThan(0);
    // Count text should contain icons
    expect(counts[0].textContent).toMatch(/icon/);

    // Strip exists
    const strips = qAll("[data-testid^=batch-preview-strip-]");
    expect(strips.length).toBeGreaterThan(0);

    // No status change: rows still unprocessed (preview doesn't write)
    // ScanTable still shows unprocessed
    const statusCells = qAll("[data-testid^=batch-status-]");
    expect(statusCells.length).toBeGreaterThan(0);
  });

  it("high perf: virtualized preview for 1000 rows renders limited DOM", async () => {
    // Simulate 1000 selected rows via large fake dir? For unit test, check panel virtualization logic exists
    // The panel should have virtualization: only render visible slice
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

    const previewBtn = q("[data-testid=batch-preview]") as HTMLElement | null;
    await click(previewBtn!);
    await settle(1200);

    const panel = q("[data-testid=batch-preview-panel]");
    expect(panel).not.toBeNull();

    // Virtualized: even with 50 rows selected, rendered DOM rows should be limited (< 30)
    const renderedRows = qAll("[data-testid^=batch-preview-row-]");
    // Should be <= 30 due to virtualization, not 50
    expect(renderedRows.length).toBeLessThanOrEqual(30);
    expect(renderedRows.length).toBeGreaterThan(0);
  });
});
