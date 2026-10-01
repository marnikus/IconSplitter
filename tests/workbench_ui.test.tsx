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

  it("opens Generate SVG from the restored tab and shows its approved-source empty state", async () => {
    saveSessionState({ ...DEFAULT_SESSION, tab: "generateSvg" }, "2026-10-01T12:00:00.000Z");
    bootStores();
    mountWorkbench();
    await settle();
    expect(getAppState().tab).toBe("generateSvg");
    expect(q("[data-testid='svg-panel']")).not.toBeNull();
    expect(q("[data-testid='svg-empty']")?.textContent).toContain("No Selection-approved AI images yet");
    expect((q("[aria-label='SVG generation prompt']") as HTMLTextAreaElement).value)
      .toBe("Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or approximate joins. Preserve seamless geometry without breaking the intended image.");
    expect(q("[data-testid='history-bar']")).not.toBeNull();
  });

  it("opens on the Selection tab the last session ended on", () => {
    saveSessionState({ ...DEFAULT_SESSION, tab: "selection" }, "2026-10-01T12:00:00.000Z");
    bootStores();
    mountWorkbench();
    expect(getAppState().tab).toBe("selection");
    // the Selection panel, not the sheets tab — this DOM has no File System
    // Access API, so the panel renders its "unsupported browser" note
    expect(q("[data-testid='sel-unsupported']")).not.toBeNull();
    expect(q("[data-testid='padding-slider']")).toBeNull();
  });
});
