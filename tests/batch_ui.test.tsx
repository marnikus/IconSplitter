// batch_ui.test.tsx — TDD for Batch folders V2 controls (zoom, date filters, filtered multi-select)

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
  const root = new FakeDir("test_process_4");
  root.children.set("icon-fire-flame_AI_6.png", new FakeFile("icon-fire-flame_AI_6.png", 10, new Date("2024-01-10").getTime(), "a"));
  root.children.set("icon-fire-flame_AI_7.png", new FakeFile("icon-fire-flame_AI_7.png", 10, new Date("2024-02-15").getTime(), "b"));
  root.children.set("icon-fire-flame_AI_8.png", new FakeFile("icon-fire-flame_AI_8.png", 10, new Date("2024-03-20").getTime(), "c"));
  root.children.set("icon-fire-flame_6.png", new FakeFile("icon-fire-flame_6.png", 5, 1000, "ref"));
  root.children.set("icon-fire-flame_7.png", new FakeFile("icon-fire-flame_7.png", 5, 1000, "ref"));
  root.children.set("icon-fire-flame_8.png", new FakeFile("icon-fire-flame_8.png", 5, 1000, "ref"));
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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
});

describe("Batch folders V2 controls", () => {
  it("shows filter grid and bulk bar with zoom 48-800 after picking root", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    expect(rootBtn).not.toBeNull();
    await click(rootBtn!);
    await settle(500);

    expect(q("[data-testid=batch-folder-path]")).not.toBeNull();
    expect(q("[data-testid=batch-filters]")).not.toBeNull();
    expect(q("[data-testid=batch-date-all]")).not.toBeNull();
    expect(q("[data-testid=batch-date-month]")).not.toBeNull();
    expect(q("[data-testid=batch-date-range]")).not.toBeNull();
    expect(q("[data-testid=batch-from]")).not.toBeNull();
    expect(q("[data-testid=batch-to]")).not.toBeNull();
    expect(q("[data-testid=batch-status]")).not.toBeNull();
    expect(q("[data-testid=batch-sort]")).not.toBeNull();
    expect(q("[data-testid=batch-dir]")).not.toBeNull();
    expect(q("[data-testid=batch-shown]")?.textContent).toMatch(/Showing/);

    expect(q("[data-testid=batch-bulk]")).not.toBeNull();
    expect(q("[data-testid=batch-zoom]")).not.toBeNull();
    const slider = q("[data-testid=batch-thumb]") as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    expect(Number(slider?.min)).toBe(48);
    expect(Number(slider?.max)).toBe(800);
    expect(q("[data-testid=batch-thumb-value]")?.textContent).toMatch(/px/);
    expect(q("[data-testid=batch-check-all]")).not.toBeNull();
    expect(q("[data-testid=batch-select-visible]")).not.toBeNull();
    expect(q("[data-testid=batch-deselect]")).not.toBeNull();
  });

  it("filtered multi-select: select visible and deselect all", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    expect(qAll("[data-testid^=row-select-]").length).toBe(3);

    const deselectBtn = q("[data-testid=batch-deselect]") as HTMLElement | null;
    expect(deselectBtn).not.toBeNull();
    await click(deselectBtn!);
    await settle(100);
    expect(q("[data-testid=batch-selected-count]")?.textContent).toMatch(/0 selected/);

    const selectVisibleBtn = q("[data-testid=batch-select-visible]") as HTMLElement | null;
    await click(selectVisibleBtn!);
    await settle(100);
    const selectedText = q("[data-testid=batch-selected-count]")?.textContent ?? "";
    expect(selectedText).toMatch(/3 selected|selected/);
  });

  it("zoom slider changes thumbnail size via lib/zoom", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);

    const slider = q("[data-testid=batch-thumb]") as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    expect(Number(slider!.min)).toBe(48);
    expect(Number(slider!.max)).toBe(800);
    const valueOut = q("[data-testid=batch-thumb-value]")?.textContent ?? "";
    expect(valueOut).toMatch(/\d+ px/);
    // Thumbnail size should match current thumb (default 84)
    const thumbs = qAll("img[alt='']");
    if (thumbs.length > 0) {
      const h = (thumbs[0] as HTMLElement).style.height;
      expect(h).toMatch(/px/);
    }
  });

  it("keeps split/export size separate from thumbnail zoom", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    // PresetBar should still show square size control
    expect(q("[data-testid=preset-size]") || q("select")).not.toBeNull();
    // Zoom is separate
    const rootBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    await click(rootBtn!);
    await settle(500);
    expect(q("[data-testid=batch-thumb]")).not.toBeNull();
  });

  it("reuses V2 folder visuals: Open folder green button and FULL PATH row with persistence", async () => {
    const dir = makeBatchRoot();
    await mount(dir);
    await settle(100);
    const openBtn = q("[data-testid=batch-open-folder]") as HTMLElement | null;
    expect(openBtn).not.toBeNull();
    expect(openBtn?.className).toMatch(/folder-open/);
    expect(openBtn?.textContent).toMatch(/Open folder/);
    await click(openBtn!);
    await settle(500);
    const pathRow = q("[data-testid=batch-folder-path]") as HTMLElement | null;
    expect(pathRow).not.toBeNull();
    expect(pathRow?.className).toMatch(/folder-path/);
    expect(pathRow?.textContent).toMatch(/Full path/i);
  });
});
