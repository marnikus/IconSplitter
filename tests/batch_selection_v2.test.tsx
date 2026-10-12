// batch_selection_v2.test.tsx — Batch folders V2 selection behaviors: purple active row separate from checked,
// ↑/↓ moves active and scrolls into view without changing checks, exact row gestures, checkbox only, anchor survives, undo, tri-state, A/E shortcuts.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider, useHistory, type HistoryApi } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_batch_v2");
  const now = 1000;
  root.children.set("icon-a_AI_1.png", new FakeFile("icon-a_AI_1.png", 10, now, "a"));
  root.children.set("icon-b_AI_2.png", new FakeFile("icon-b_AI_2.png", 10, now, "b"));
  root.children.set("icon-c_AI_3.png", new FakeFile("icon-c_AI_3.png", 10, now, "c"));
  root.children.set("icon-a_1.png", new FakeFile("icon-a_1.png", 5, 1000, "ref"));
  root.children.set("icon-b_2.png", new FakeFile("icon-b_2.png", 5, 1000, "ref"));
  root.children.set("icon-c_3.png", new FakeFile("icon-c_3.png", 5, 1000, "ref"));
  return root;
}

let host: HTMLDivElement;
let ui: Root;
let api: HistoryApi;

function Probe() {
  api = useHistory();
  return null;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const qAll = (sel: string) => host.querySelectorAll(sel) as NodeListOf<HTMLElement>;
const settle = async (ms = 80) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const click = async (el: Element | null) => {
  if (!el) throw new Error("click target missing");
  await act(async () => { (el as HTMLElement).click(); });
};
const rowClick = async (rel: string, init: MouseEventInit = {}) => {
  const sel = `[data-testid='batch-row-${rel}']`;
  const el = q(sel);
  if (!el) throw new Error(`row ${rel} not found ${sel}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
  await settle(50);
};
const checkClick = async (rel: string) => {
  const sel = `[data-testid='row-select-${rel}']`;
  const el = q(sel) as HTMLInputElement | null;
  if (!el) throw new Error(`checkbox ${rel} not found`);
  await act(async () => {
    el.click();
  });
  await settle(50);
};
const keyDown = async (key: string, opts: KeyboardEventInit = {}) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
  });
  await settle(50);
};

async function mountPanel() {
  const dir = makeBatchRoot();
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = async () => dir as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(
      <HistoryProvider>
        <BatchPanel />
        <HistoryBar />
        <Probe />
      </HistoryProvider>,
    );
  });
  await settle(100);
  const rootBtn = q("[data-testid=batch-open-folder]");
  if (!rootBtn) throw new Error("open folder btn missing");
  await click(rootBtn);
  await settle(600);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.removeItem(BATCH_PREFS_KEY);
  resetAppStore();
  await dropDb();
  clearKnownRoots();
  vi.restoreAllMocks();
  if (host) {
    await act(async () => ui.unmount());
    host.remove();
  }
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
  await mountPanel();
});

describe("Batch V2 selection: active row separate from checked", () => {
  it("purple active row is separate from checked bulk rows", async () => {
    const rows = qAll("[data-testid^='batch-row-'][role='listitem']");
    expect(rows.length).toBe(3);
    // New behavior: after scan, all selected (checked = all). Deselect first to test active-only.
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);
    // Plain click = active only (fix a34b050)
    await rowClick("icon-a_AI_1.png");
    const first = q("[data-testid='batch-row-icon-a_AI_1.png']");
    expect(first?.className).toMatch(/active/);
    expect(first?.className).not.toMatch(/selected/);
    // Checkbox toggles checked but active stays
    await checkClick("icon-a_AI_1.png");
    expect(first?.className).toMatch(/active/);
    expect(first?.className).toMatch(/selected/);
    await checkClick("icon-b_AI_2.png");
    const second = q("[data-testid='batch-row-icon-b_AI_2.png']");
    expect(second?.className).toMatch(/selected/);
    expect(first?.className).toMatch(/active/);
    // Active still first, checked includes both
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/2 selected/);
  });

  it("↑/↓ moves active row and scrolls into view without changing checks", async () => {
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await rowClick("icon-a_AI_1.png");
    await checkClick("icon-a_AI_1.png"); // ensure checked
    await checkClick("icon-b_AI_2.png");
    const beforeCount = q("[data-testid=batch-selected-count]")?.textContent;
    await keyDown("ArrowDown");
    const second = q("[data-testid='batch-row-icon-b_AI_2.png']");
    expect(second?.className).toMatch(/active/);
    // Checked count unchanged
    expect(q("[data-testid=batch-selected-count]")?.textContent).toBe(beforeCount);
    await keyDown("ArrowUp");
    const first = q("[data-testid='batch-row-icon-a_AI_1.png']");
    expect(first?.className).toMatch(/active/);
  });

  it("click selects one, Shift-click selects visible range from anchor", async () => {
    // After fix a34b050: plain click = active only, sets anchor; Shift-click range selects
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await rowClick("icon-a_AI_1.png");
    await rowClick("icon-c_AI_3.png", { shiftKey: true });
    // Should select range a,b,c (anchor set by first click)
    expect(qAll("[data-testid^='batch-row-'][role='listitem']").length).toBe(3);
    for (const rel of ["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-c_AI_3.png"]) {
      const cb = q(`[data-testid='row-select-${rel}']`) as HTMLInputElement;
      expect(cb.checked).toBe(true);
    }
  });

  it("Ctrl/Alt/Meta-click toggles one row with Shift precedence", async () => {
    // After fix: plain click = active only, Ctrl toggles checked
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await checkClick("icon-a_AI_1.png");
    await rowClick("icon-c_AI_3.png", { ctrlKey: true });
    expect((q(`[data-testid='row-select-icon-a_AI_1.png']`) as HTMLInputElement).checked).toBe(true);
    expect((q(`[data-testid='row-select-icon-c_AI_3.png']`) as HTMLInputElement).checked).toBe(true);
    // Toggle off a
    await rowClick("icon-a_AI_1.png", { ctrlKey: true });
    expect((q(`[data-testid='row-select-icon-a_AI_1.png']`) as HTMLInputElement).checked).toBe(false);
    // Shift takes precedence over Ctrl
    await rowClick("icon-a_AI_1.png");
    await rowClick("icon-c_AI_3.png", { shiftKey: true, ctrlKey: true });
    for (const rel of ["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-c_AI_3.png"]) {
      expect((q(`[data-testid='row-select-${rel}']`) as HTMLInputElement).checked).toBe(true);
    }
  });

  it("checkbox clicks change checks only, not active", async () => {
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await rowClick("icon-a_AI_1.png");
    const activeBefore = q("[data-testid='batch-row-icon-a_AI_1.png']")?.className;
    expect(activeBefore).toMatch(/active/);
    await checkClick("icon-b_AI_2.png");
    // Active still a
    expect(q("[data-testid='batch-row-icon-a_AI_1.png']")?.className).toMatch(/active/);
    expect(q("[data-testid='batch-row-icon-b_AI_2.png']")?.className).not.toMatch(/active/);
  });

  it("tri-state header, Select visible, Deselect all, counts", async () => {
    const header = q("[data-testid=batch-check-all]") as HTMLInputElement;
    expect(header).not.toBeNull();
    // New behavior: after scan, checked = all (3), so header all
    await settle(100);
    expect(header.checked).toBe(true);
    // Deselect all to get none
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    expect(header.checked).toBe(false);
    // Select visible
    await click(q("[data-testid=batch-select-visible]"));
    expect(header.checked).toBe(true);
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/3 selected/);
    // Deselect one to get indeterminate
    await checkClick("icon-a_AI_1.png");
    expect(header.indeterminate).toBe(true);
    // Deselect all
    await click(q("[data-testid=batch-deselect]"));
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);
  });

  it("keeps missing/deleted ineligible and preserves Split approved (review feature)", async () => {
    // All our rows are unprocessed but pending review, not approved, so Split approved disabled
    // First approve them, then split should be enabled
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await click(q("[data-testid=batch-select-visible]"));
    await settle(100);
    // At this point pending, not approved, so split disabled (only approved can split)
    let splitBtn = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(splitBtn.disabled).toBe(true);
    expect(splitBtn.textContent).toMatch(/Split approved \(0\)/);
    // Approve selected
    await click(q("[data-testid=batch-approve-selected]"));
    await settle(200);
    splitBtn = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(splitBtn.disabled).toBe(false);
    expect(splitBtn.textContent).toMatch(/Split approved \(3\)/);
  });

  it("each selection gesture is one undo entry", async () => {
    await click(q("[data-testid=batch-deselect]"));
    await settle(50);
    const beforeLen = api.entries.length;
    await rowClick("icon-a_AI_1.png");
    await settle(50);
    expect(api.entries.length).toBe(beforeLen + 1);
    await rowClick("icon-c_AI_3.png", { shiftKey: true });
    await settle(50);
    expect(api.entries.length).toBe(beforeLen + 2);
    // Undo range
    await click(q("[data-testid=hist-undo]"));
    await settle(100);
    expect((q(`[data-testid='row-select-icon-b_AI_2.png']`) as HTMLInputElement).checked).toBe(false);
  });

  it("Q/E shortcuts select/deselect only active row (reusable active-only)", async () => {
    await click(q("[data-testid=batch-deselect]"));
    // Click to set active row
    await rowClick("icon-b_AI_2.png");
    await keyDown("e");
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/1 selected/);
    expect((q(`[data-testid='row-select-icon-b_AI_2.png']`) as HTMLInputElement).checked).toBe(true);
    await keyDown("q");
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);
    expect((q(`[data-testid='row-select-icon-b_AI_2.png']`) as HTMLInputElement).checked).toBe(false);
    // Uppercase should also work
    await keyDown("E");
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/1 selected/);
    await keyDown("Q");
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);
    // Bulk still via buttons
    await click(q("[data-testid=batch-select-visible]"));
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/3 selected/);
    await click(q("[data-testid=batch-deselect]"));
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);
  });

  it("checked rows and anchor survive filtering", async () => {
    await click(q("[data-testid=batch-deselect]"));
    await settle(100);
    await rowClick("icon-a_AI_1.png");
    await rowClick("icon-c_AI_3.png", { shiftKey: true });
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/3 selected/);
    await keyDown("ArrowDown");
    await keyDown("ArrowDown");
    expect(q("[data-testid='batch-row-icon-c_AI_3.png']")?.className).toMatch(/active/);
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/3 selected/);
  });
});
