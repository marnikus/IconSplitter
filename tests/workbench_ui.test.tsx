// workbench_ui.test.tsx — the shell above the panels: the restored tab is the
// one that opens, a tab switch goes through the store (so it survives a
// restart), and the global undo/redo bar is present on every tab.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SESSION } from "../src/lib/session";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { bootStores } from "../src/state/boot";
import { loadSessionState, saveSessionState } from "../src/state/sessionstore";
import Workbench from "../src/ui/Workbench";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function mountWorkbench(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
}

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
});

describe("the shell", () => {
  it("shows the undo/redo bar next to the tabs on the default tab", () => {
    mountWorkbench();
    expect(q("[data-testid='history-bar']")).not.toBeNull();
    expect(q("[data-testid='hist-undo']")).not.toBeNull();
    expect(q("[data-testid='tabbar']")).not.toBeNull();
  });

  it("switches tabs through the store, so the choice is the one restored next time", async () => {
    mountWorkbench();
    await click("[data-testid='tab-batch']");
    await settle();
    expect(getAppState().tab).toBe("batch");
    expect(loadSessionState().tab).toBe("sheets"); // debounced, not written yet
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(loadSessionState().tab).toBe("batch"); // …and now it is
  });

  it("opens on the tab the last session ended on", () => {
    saveSessionState({ ...DEFAULT_SESSION, tab: "selection" }, "2026-10-01T12:00:00.000Z");
    bootStores();
    mountWorkbench();
    expect(getAppState().tab).toBe("selection");
    // the Selection panel, not the sheets tab — this DOM has no File System
    // Access API, so the panel renders its "unsupported browser" note
    expect(q("[data-testid='sel-unsupported']")).not.toBeNull();
    expect(q("[data-testid='padding-slider']")).toBeNull();
  });

  it("offers the SVG to upload tab right after Generate SVG, and opens its panel", async () => {
    mountWorkbench();
    const tabs = [...host.querySelectorAll("[data-testid^='tab-']")].map((el) => el.getAttribute("data-testid"));
    expect(tabs).toEqual(["tab-sheets", "tab-batch", "tab-selection", "tab-selection-v2", "tab-generate-svg", "tab-upload"]);
    await click("[data-testid='tab-upload']");
    await settle();
    expect(getAppState().tab).toBe("upload");
    // this DOM has no File System Access API, so the panel renders its note
    expect(q("[data-testid='upload-unsupported']")).not.toBeNull();
    expect(q("[data-testid='upload-panel']")).toBeNull();
  });
});

describe("the Generate SVG tab is kept alive (2026-10-08)", () => {
  it("mounts the SVG panel once and parks it hidden on other tabs, so a run in flight is never unmounted", async () => {
    mountWorkbench();
    await click("[data-testid='tab-generate-svg']");
    await settle();
    const parked = q("[data-testid='svg-shell']") as HTMLElement;
    expect(parked).not.toBeNull();
    expect(parked.hidden).toBe(false);
    expect(q("[data-testid='svg-unsupported']")).not.toBeNull(); // this DOM has no File System Access API

    await click("[data-testid='tab-batch']");
    await settle();
    expect(getAppState().tab).toBe("batch");
    expect(q("[data-testid='svg-shell']")).toBe(parked); // the same node: kept, not re-created
    expect(parked.hidden).toBe(true);
    expect(q("[data-testid='svg-unsupported']")).not.toBeNull();

    await click("[data-testid='tab-generate-svg']");
    await settle();
    expect(q("[data-testid='svg-shell']")).toBe(parked);
    expect(parked.hidden).toBe(false);
  });

  it("the other tabs still mount only when open", async () => {
    mountWorkbench();
    expect(q("[data-testid='svg-shell']")).not.toBeNull(); // parked from the start
    expect((q("[data-testid='svg-shell']") as HTMLElement).hidden).toBe(true);
    expect(q("[data-testid='upload-unsupported']")).toBeNull();
  });
});
