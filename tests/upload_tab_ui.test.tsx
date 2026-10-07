// upload_tab_ui.test.tsx — the tab as the user meets it.
//
// Mounting it is the integration test that matters here: the composition hook,
// the store subscriptions and every panel must survive a render without a
// browser file-system API, and the controls must be wired to the same values the
// export reads. A pure unit test of any single hook would not have caught a
// mismatched field name between the toolbar and the settings record.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import UploadPanel from "../src/upload/UploadPanel";
import { getUploadState, resetUploadStore, setUploadState } from "../src/upload/store";
import { iconRow } from "./helpers/uploadrows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = () => host.textContent ?? "";
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
/** React tracks a controlled input's value, so the DOM setter is used directly. */
const type = async (sel: string, value: string) => {
  const field = q(sel) as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<UploadPanel />); });
}

beforeEach(() => {
  localStorage.clear();
  resetUploadStore();
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
});

describe("the SVG to upload tab", () => {
  it("opens with the source folder, the prompt and the Gemini panel", () => {
    mount();
    for (const testid of ["upload-open-folder", "upload-rescan", "upload-prompt-box", "upload-model", "upload-zoom", "upload-counts"]) {
      expect(q(`[data-testid='${testid}']`), testid).not.toBeNull();
    }
  });

  it("says what the tab is for when the browser has no folder picker", () => {
    mount();
    expect(q("[data-testid='upload-unsupported']")).not.toBeNull();
    expect(text()).toContain("Chrome or Edge"); // the browser it needs, named
    expect(text()).toContain("Apply to selected"); // …and the tab is still there
    expect((q("[data-testid='upload-open-folder']") as HTMLButtonElement).disabled).toBe(false);
    expect((q("[data-testid='upload-rescan']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks a run with a message a person can act on, and never a silent no-op", () => {
    mount();
    const exportButton = q("[data-testid='upload-export']") as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(text()).toContain("Open the folder holding the approved SVGs");
    expect(text()).toContain("No approved SVGs were found");
  });

  it("shows one row per approved SVG, with its own metadata block and counts", async () => {
    const row = iconRow("arrow-right");
    setUploadState({ rootName: "icons", rows: [row], checked: [row.id] });
    mount();
    expect(q(`[data-testid='upload-row-${row.id}']`)).not.toBeNull();
    expect(q(`[data-testid='upload-meta-${row.id}']`)).not.toBeNull();
    expect(q(`[data-testid='upload-tags-${row.id}']`)?.textContent).toContain("0/40");
    expect(q("[data-testid='upload-counts']")?.textContent).toContain("1 eligible");
    expect(q(`[data-testid='upload-status-${row.id}']`)?.textContent).toBe("awaiting metadata");
  });

  it("writes an edit through the store, so the export reads the same value", async () => {
    const row = iconRow("arrow-right");
    setUploadState({ rootName: "icons", rows: [row], checked: [row.id] });
    mount();
    await type("[data-testid='upload-padding']", "24");
    expect(getUploadState().settings.paddingPct).toBe(24);
    await click("[data-testid='upload-apply-settings']");
    expect(getUploadState().overrides[row.id]).toEqual({ paddingPct: 24 });
  });

  it("keeps the zoom in the tab's own state and refuses to leave its range", async () => {
    mount();
    await type("[data-testid='upload-zoom']", "600");
    expect(q("[data-testid='upload-zoom']")).not.toBeNull();
    expect(text()).toContain("440px");
  });
});
