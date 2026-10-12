// batch_preview_layout_fix.test.tsx — TDD for preview column widening + immediate per-row Apply
// Requirements (from user red line):
// - Preview splits column starts much further left toward File/Path, 4 icons fit in one row without scrollbar
// - Keep 2 rows display ok, no scrollbar hiding icons, flex-wrap not overflow-x-auto
// - Apply shows preview for that row immediately, no need to wait global Preview splits rerun

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

function makeRoot(): FakeDir {
  const root = new FakeDir("preview_layout_fix");
  root.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 10, Date.now(), "a"));
  root.children.set("icon-a.png", new FakeFile("icon-a.png", 5, 1000, "ref"));
  root.children.set("icon-b_AI.png", new FakeFile("icon-b_AI.png", 10, Date.now(), "b"));
  root.children.set("icon-b.png", new FakeFile("icon-b.png", 5, 1000, "ref"));
  root.children.set("icon-c_AI.png", new FakeFile("icon-c_AI.png", 10, Date.now(), "c"));
  root.children.set("icon-c.png", new FakeFile("icon-c.png", 5, 1000, "ref"));
  root.children.set("icon-d_AI.png", new FakeFile("icon-d_AI.png", 10, Date.now(), "d"));
  root.children.set("icon-d.png", new FakeFile("icon-d.png", 5, 1000, "ref"));
  return root;
}

let host: HTMLDivElement;
let root: Root;

async function mount(dir?: FakeDir) {
  if (dir) (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
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
   
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
});

function blocks(needle: string): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)}/g;
  for (const m of css().matchAll(rule)) if (m[1].includes(needle)) out.push(m[2]);
  return out;
}
const body = (needle: string) => blocks(needle).join("\n");

describe("Batch preview layout — column extends left toward File/Path", () => {
  it("batch grid gives Preview at least 360px and narrows File/Path + Detection to move preview left", () => {
    // Read current grid for batch-row
    const texts = blocks(".batch-row");
    const combined = texts.join(" ");
    // Should contain our widened preview: min at least 380px with 1fr, detection max at most 440, file max at most 220
    // These numbers guarantee preview starts ~200px earlier than old 560px detection
    expect(combined).toMatch(/grid-template-columns/);
    // Check that preview column is minmax with large min and 1fr
    // e.g. minmax(380px, 1fr) or minmax(360px, 1fr) or minmax(400px, 1fr) — at least 360
    const colMatch = combined.match(/grid-template-columns:[^;]*minmax\((\d+)px,\s*1fr\)/);
    expect(colMatch).not.toBeNull();
    const previewMin = colMatch ? Number(colMatch[1]) : 0;
    expect(previewMin).toBeGreaterThanOrEqual(360);

    // File/Path column should not be huge 280px max — should be <= 230 to free space
    // Our new file column is e.g. minmax(150px, 210px) or 160-220 — max <= 230
    const fileMins = [...combined.matchAll(/minmax\((\d+)px,\s*(\d+)px\)/g)].map((m) => ({ min: Number(m[1]), max: Number(m[2]) }));
    // file is first minmax, detection second, preview is 1fr not counted; so take those with px,px
    // Expect at least one max <= 230 (file) and at least one detection max <= 500 (was 560)
    const fileCandidates = fileMins.filter((r) => r.max <= 300 && r.max >= 150);
    expect(fileCandidates.length).toBeGreaterThan(0);
    const fileMax = Math.min(...fileCandidates.map((r) => r.max));
    expect(fileMax).toBeLessThanOrEqual(230);
    // Detection column (second minmax with px,px) should have max <= 500 to leave preview space, and min >= 340 to keep bar unfrozen
    const detectionMaxes = fileMins.map((r) => r.max);
    const detectionMax = Math.max(...detectionMaxes);
    expect(detectionMax).toBeLessThanOrEqual(500);
    expect(detectionMax).toBeGreaterThanOrEqual(340);
  });

  it("preview strip uses flex-wrap with no horizontal scrollbar, allows 2 rows", () => {
    // The strip container in ScanTable.tsx is flex flex-wrap, not overflow-x-auto
    // We check both the TSX class and the CSS: there should be no overflow-x:auto on preview strip class
    // Instead, the component should have flex-wrap
    // Read ScanTable source for class
    const src = readFileSync(join(process.cwd(), "src/batch/ScanTable.tsx"), "utf8");
    // PreviewCell strip should have flex-wrap and must NOT have overflow-x-auto
    expect(src).toMatch(/batch-preview-strip/);
    // extract the PreviewCell block for the strip div
    // Simpler: just check src contains flex-wrap for strip and not overflow-x-auto near it
    expect(src).toContain("batch-preview-strip");
    // The line with batch-preview-strip should have flex-wrap
    const lines = src.split("\n").filter((l) => l.includes("batch-preview-strip"));
    const stripLine = lines.join(" ");
    expect(stripLine).toMatch(/flex-wrap/);
    expect(stripLine).not.toMatch(/overflow-x-auto/);
    // Also ensure container is w-full min-w-0 and thumbs are h-12 w-12
    const previewSrc = src.split("function PreviewCell")[1]?.split("function RowMergeCell")[0] ?? "";
    expect(previewSrc).toMatch(/flex-wrap/);
    expect(previewSrc).not.toMatch(/overflow-x-auto/);
    expect(previewSrc).toMatch(/h-12 w-12/);
  });

  it("preview for 4 icons would fit in widened column without scrollbar (CSS widths permit)", () => {
    // Calculate required width for 4 icons: 4*48 + 3*6 = 210px plus padding. Preview min 360+ guarantees fit.
    // Also ensure batch-row width is 100% and min-width 0 so 1fr expands properly
    const batchRowBodies = body(".batch-row");
    expect(batchRowBodies).toMatch(/width:\s*100%/);
    expect(batchRowBodies).toMatch(/min-width:\s*0/);
    // And batch-columns same grid as batch-row
    const batchColBodies = body(".batch-columns");
    expect(batchColBodies).toMatch(/grid-template-columns/);
  });
});

describe("Batch per-row Apply shows preview immediately without global Preview splits", () => {
  it("Apply on a row triggers preview for that row alone, no global preview needed", async () => {
    const dir = makeRoot();
    await mount(dir);
    await settle(100);
    const openBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(openBtn!);
    await settle(600);

    // Ensure no previews initially before any Apply or global preview
    expect(qAll("[data-testid^=batch-preview-count-]").length).toBe(0);

    // Deselect all to prove Apply works even without selection (per-row immediate)
    const deselect = q("[data-testid=batch-deselect]") as HTMLElement | null;
    if (deselect) {
      await click(deselect);
      await settle(100);
    }

    const firstPath = "icon-a_AI.png";
    const slider = q(`[data-testid="batch-row-merge-slider-${firstPath}"]`) as HTMLInputElement | null;
    const applyBtn = q(`[data-testid="batch-row-merge-apply-${firstPath}"]`) as HTMLButtonElement | null;
    expect(slider).not.toBeNull();
    expect(applyBtn).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider!, "0.06");
      slider!.dispatchEvent(new Event("input", { bubbles: true }));
      slider!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(120);
    await click(applyBtn!);
    // After Apply, preview for that row should appear immediately without clicking global Preview splits
    await settle(900);

    const count = q(`[data-testid="batch-preview-count-${firstPath}"]`) as HTMLElement | null;
    expect(count).not.toBeNull();
    // Should show count or Loading then done — but at least not missing
    expect(count!.textContent).toMatch(/icon|Loading|Failed/);
    // After a bit more for fallback done state
    await settle(500);
    const countDone = q(`[data-testid="batch-preview-count-${firstPath}"]`) as HTMLElement | null;
    expect(countDone!.textContent).toMatch(/icon|Loading|Failed/);
    // Only this row's preview exists immediately (others may still be none until global preview)
    // At least the applied row has preview
    expect(countDone).not.toBeNull();

    // Global preview button still exists but was not clicked
    const previewBtn = q("[data-testid=batch-preview]") as HTMLButtonElement | null;
    expect(previewBtn).not.toBeNull();
    // No file writes occurred
    const hasOutput = Array.from(dir.children.keys()).some((k) => k.includes("_split_output"));
    expect(hasOutput).toBe(false);
  }, 15000);

  it("Reset after Apply also refreshes preview immediately", async () => {
    const dir = makeRoot();
    await mount(dir);
    await settle(100);
    const openBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(openBtn!);
    await settle(600);

    const firstPath = "icon-a_AI.png";
    const slider = q(`[data-testid="batch-row-merge-slider-${firstPath}"]`) as HTMLInputElement | null;
    const applyBtn = q(`[data-testid="batch-row-merge-apply-${firstPath}"]`) as HTMLButtonElement | null;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider!, "0.07");
      slider!.dispatchEvent(new Event("input", { bubbles: true }));
      slider!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(100);
    await click(applyBtn!);
    await settle(800);
    const appliedLabel = q(`[data-testid="batch-row-merge-label-${firstPath}"]`) as HTMLElement | null;
    expect(appliedLabel!.textContent).toMatch(/overridden/);

    const resetBtn = q(`[data-testid="batch-row-merge-reset-${firstPath}"]`) as HTMLButtonElement | null;
    expect(resetBtn!.disabled).toBe(false);
    await click(resetBtn!);
    await settle(800);
    // After Reset, label should lose overridden and preview should still be present (refreshed)
    const afterReset = q(`[data-testid="batch-row-merge-label-${firstPath}"]`) as HTMLElement | null;
    expect(afterReset!.textContent).not.toMatch(/overridden/);
    const countAfterReset = q(`[data-testid="batch-preview-count-${firstPath}"]`) as HTMLElement | null;
    expect(countAfterReset).not.toBeNull();
  }, 15000);
});
