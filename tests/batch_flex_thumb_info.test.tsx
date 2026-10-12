// batch_flex_thumb_info.test.tsx — TDD for flex thumb+info cell, 7-col flex grid
// Requirements: file name + other info under thumbnail, remove File/path column, all columns flex (only checkbox 34px fixed)

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_flex_thumb");
  root.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 10, Date.now(), "a"));
  root.children.set("icon-a.png", new FakeFile("icon-a.png", 5, 1000, "ref"));
  root.children.set("icon-b_AI.png", new FakeFile("icon-b_AI.png", 10, Date.now(), "b"));
  root.children.set("icon-b.png", new FakeFile("icon-b.png", 5, 1000, "ref"));
  return root;
}

let host: HTMLDivElement;
let root: Root;

async function mount(dir?: FakeDir) {
  if (dir) (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<BatchPanel />); });
  return host;
}
function q(sel: string): Element | null { return host.querySelector(sel); }
function qAll(sel: string): NodeListOf<Element> { return host.querySelectorAll(sel); }
async function settle(ms = 80) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function click(el: Element) { await act(async () => { (el as HTMLElement).click(); }); }

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); localStorage.removeItem(BATCH_PREFS_KEY);
  await dropDb(); clearKnownRoots(); vi.restoreAllMocks();
  if (host) { await act(async () => root.unmount()); host.remove(); }
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
});

describe("Batch flex thumb+info layout", () => {
  it("combines thumbnail and file info into one cell under thumbnail", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    const rows = qAll("[data-testid^=batch-row-]");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // New cell data-testid batch-thumbinfo-
    const thumbInfos = qAll("[data-testid^=batch-thumbinfo-]");
    expect(thumbInfos.length).toBeGreaterThanOrEqual(2);
    // Each thumbinfo should contain file name and path - check all contain AI png
    const allText = Array.from(thumbInfos).map(el => (el as HTMLElement).textContent || "").join(" ");
    expect(allText).toMatch(/icon-a_AI\.png/);
    expect(allText).toMatch(/icon-b_AI\.png/);
    // Should have img or pulse inside first
    const first = thumbInfos[0] as HTMLElement;
    const imgOrPulse = first.querySelector("img, div.animate-pulse");
    expect(imgOrPulse).not.toBeNull();
    // Should show relPath underneath
    expect(first.textContent).toMatch(/icon-.*_AI/);
  });

  it("removes File/path column, header has 9 cols (checkbox + 8 with Review/Decision)", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    const cols = q(".batch-columns") as HTMLElement | null;
    expect(cols).not.toBeNull();
    const spans = cols!.querySelectorAll("span");
    expect(spans.length).toBe(9); // checkbox + 8 columns (includes Review + Decision)
    const texts = Array.from(spans).map(s => s.textContent?.trim() || "");
    // No separate File/path old label, now combined
    expect(texts.join(" ")).not.toMatch(/File \/ path$/);
    expect(texts.join(" ")).toMatch(/AI Image \/ File/);
    expect(texts.join(" ")).toMatch(/Detection/);
    expect(texts.join(" ")).toMatch(/Preview splits/);
    expect(texts.join(" ")).toMatch(/Review/);
    expect(texts.join(" ")).toMatch(/Decision/);
  });

  it("all columns flex width (only checkbox fixed 34px), uses minmax fr", async () => {
    // Check CSS file directly for grid-template
    const { readFileSync } = await import("fs");
    const css = readFileSync("src/index.css", "utf-8");
    // Find batch-columns definition
    const match = css.match(/\.batch-columns,\s*\.batch-row\s*\{[^}]*grid-template-columns:[^;]+;/);
    expect(match).not.toBeNull();
    const rule = match![0];
    // Must have 34px fixed
    expect(rule).toMatch(/34px/);
    // Must have minmax with fr
    expect(rule).toMatch(/minmax\(160px,\s*1fr\)/);
    expect(rule).toMatch(/minmax\(380px,\s*1\.2fr\)/);
    expect(rule).toMatch(/minmax\(320px,\s*2fr\)/);
    // No 140px fixed for old thumb column
    expect(rule).not.toMatch(/140px/);
    // Detection min 380
    expect(rule).toMatch(/380px/);
    // Preview 2fr biggest
    expect(rule).toMatch(/2fr/);
  });

  it("Detection bar stays one-row flex-nowrap min 360 and real-time", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    const bar = q("[data-testid=\"batch-row-merge-bar-icon-a_AI.png\"]") as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.className).toMatch(/flex-nowrap/);
    expect(bar!.className).toMatch(/min-w-\[360px\]/);
  });

  it("selection still: plain click active only, checkbox select, preserves checked", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    // New: after scan all selected, deselect to test active-only behavior
    const deselect = q("[data-testid=batch-deselect]") as HTMLElement | null;
    if (deselect) { await click(deselect); await settle(100); }
    const firstRow = q("[data-testid=\"batch-row-icon-a_AI.png\"]") as HTMLElement | null;
    const secondRow = q("[data-testid=\"batch-row-icon-b_AI.png\"]") as HTMLElement | null;
    expect(firstRow).not.toBeNull(); expect(secondRow).not.toBeNull();
    // Click first row (plain)
    await click(firstRow!); await settle(100);
    expect(firstRow!.classList.contains("active")).toBe(true);
    // Check checkbox for first row
    const firstCheck = q("[data-testid=\"row-select-icon-a_AI.png\"]") as HTMLInputElement | null;
    await click(firstCheck!); await settle(100);
    expect(firstCheck!.checked).toBe(true);
    // Click second row plain should NOT deselect first checkbox, only change active
    await click(secondRow!); await settle(100);
    expect(secondRow!.classList.contains("active")).toBe(true);
    const firstCheckAfter = q("[data-testid=\"row-select-icon-a_AI.png\"]") as HTMLInputElement | null;
    expect(firstCheckAfter!.checked).toBe(true); // still checked
  });

  it("previews persist on local detection change (drag does not clear)", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    const selectVisible = q("[data-testid=batch-select-visible]") as HTMLElement | null; await click(selectVisible!); await settle(100);
    const previewBtn = q("[data-testid=batch-preview]") as HTMLElement | null; await click(previewBtn!); await settle(1000);
    const countsBefore = qAll("[data-testid^=batch-preview-count-]");
    expect(countsBefore.length).toBeGreaterThan(0);
    const slider = q("[data-testid=\"batch-row-merge-slider-icon-a_AI.png\"]") as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider!, "0.06");
      slider!.dispatchEvent(new Event("input", { bubbles: true }));
      slider!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(150);
    const countsAfter = qAll("[data-testid^=batch-preview-count-]");
    expect(countsAfter.length).toBeGreaterThan(0);
  });

  it("Apply sets override and immediately regenerates preview for this row", async () => {
    const dir = makeBatchRoot(); await mount(dir); await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null; await click(rootBtn!); await settle(600);
    const firstPath = "icon-a_AI.png";
    const slider = q(`[data-testid="batch-row-merge-slider-${firstPath}"]`) as HTMLInputElement | null;
    const applyBtn = q(`[data-testid="batch-row-merge-apply-${firstPath}"]`) as HTMLElement | null;
    expect(slider).not.toBeNull(); expect(applyBtn).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider!, "0.07");
      slider!.dispatchEvent(new Event("input", { bubbles: true }));
      slider!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(100);
    await click(applyBtn!); await settle(900);
    const previewAfterApply = q(`[data-testid="batch-preview-count-${firstPath}"]`) as HTMLElement | null;
    expect(previewAfterApply).not.toBeNull();
    expect(previewAfterApply!.textContent).toMatch(/icon|Loading|Failed/);
    const label = q(`[data-testid="batch-row-merge-label-${firstPath}"]`) as HTMLElement | null;
    expect(label!.textContent).toMatch(/overridden/);
  });
});
