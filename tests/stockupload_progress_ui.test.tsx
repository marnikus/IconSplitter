// stockupload_progress_ui.test.tsx — the cross-tab upload bar: it is finished
// (green, tick, closable) when the RUN returned, never because a count reached
// its total. A run that still has files open keeps Cancel and stays under 100 %,
// and a finished run with failures says so instead of "Upload complete".
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockUploadDialogs from "../src/stockupload/StockUploadDialogs";
import type { StockUploadApi } from "../src/stockupload/useStockUpload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mount: HTMLDivElement;
let host: HTMLDivElement;
let ui: Root;

function api(overrides: Partial<StockUploadApi> = {}): StockUploadApi {
  return {
    model: { dialog: null, uploading: false, progress: { done: 14, total: 14, label: "14 file(s) ready to submit", complete: true } },
    confirmUpload: vi.fn(),
    closeDialog: vi.fn(),
    cancelUpload: vi.fn(),
    dismissProgress: vi.fn(),
    ...overrides,
  } as unknown as StockUploadApi;
}

function render(g: StockUploadApi): Promise<void> {
  return act(async () => { ui.render(<StockUploadDialogs g={g} />); });
}

function click(el: HTMLElement): Promise<void> {
  return act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

beforeEach(() => {
  mount = document.createElement("div");
  mount.id = "stock-upload-progress-mount";
  document.body.append(mount);
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  mount.remove();
});

describe("stock upload progress bar", () => {
  it("is a finished bar at 100% once the run returned, and can be closed", async () => {
    const g = api();
    await render(g);
    const bar = mount.querySelector('[data-testid="stock-upload-progress-header"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.className).toContain("complete");
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).toBe("100%");
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Upload complete");
    // Cancel makes no sense on a finished bar; the ✕ close does.
    expect(mount.querySelector('[data-testid="stock-progress-cancel"]')).toBeNull();
    const dismiss = mount.querySelector('[data-testid="stock-progress-dismiss"]') as HTMLElement;
    expect(dismiss).not.toBeNull();
    await click(dismiss);
    expect(g.dismissProgress).toHaveBeenCalledTimes(1);
  });

  it("never shows 100 % while the run still has files open", async () => {
    // The reported bug: every picture had arrived, so the count reached the
    // total and the bar claimed "Upload complete" while two cards were not
    // uploaded and one had never turned Ready to submit.
    const g = api({
      model: {
        dialog: null, uploading: true,
        progress: { done: 12, total: 14, failed: 2, pending: 2, label: "10 of 14 file(s) ready to submit, 2 failed, 2 still ingesting" },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).not.toBe("100%");
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Uploading to stock sites — 2 failed");
    expect(mount.querySelector('[data-testid="stock-progress-cancel"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="stock-progress-dismiss"]')).toBeNull();
  });

  it("keeps Cancel while files are still going up", async () => {
    const g = api({
      model: { dialog: null, uploading: true, progress: { done: 3, total: 14, label: "Getty Images: uploading 5 of 14 file(s)" } },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).toBe("21%");
    expect(mount.querySelector('[data-testid="stock-progress-dismiss"]')).toBeNull();
    expect(mount.querySelector('[data-testid="stock-progress-cancel"]')).not.toBeNull();
    const bar = mount.querySelector('[data-testid="stock-upload-progress-header"]') as HTMLElement;
    expect(bar.className).not.toContain("complete");
  });

  it("says the run finished with errors instead of claiming success", async () => {
    const g = api({
      model: {
        dialog: null, uploading: false,
        progress: { done: 14, total: 14, label: "13 file(s) ready to submit, 1 failed", complete: true, failed: 1 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Upload finished with 1 failed");
    expect(mount.querySelector('[data-testid="stock-progress-dismiss"]')).not.toBeNull();
  });

  it("offers a retry only while the batch is still open, and names what it fixes", async () => {
    const retry = { sessionKey: "run-1", names: ["icon-map-pin_6_03_v4.eps"] };
    const g = api({
      model: {
        dialog: null, uploading: false, retry,
        progress: {
          done: 13, total: 14, failed: 1, pending: 1, complete: true,
          label: "Getty: 13 of 14 file(s) ready to submit, 1 still not ready",
        },
      },
      retryOpenFiles: vi.fn(),
    } as unknown as Partial<StockUploadApi>);
    await render(g);
    const button = mount.querySelector('[data-testid="stock-progress-retry"]') as HTMLElement;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain("Retry not-ready files");
    await click(button);
    expect(g.retryOpenFiles).toHaveBeenCalledTimes(1);
  });

  it("hides the retry once the batch was submitted", async () => {
    const g = api({
      model: { dialog: null, uploading: false, retry: null, progress: { done: 14, total: 14, label: "14 file(s) ready to submit", complete: true } },
    } as unknown as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-progress-retry"]')).toBeNull();
  });

  it("stays on screen after the run returns, until it is closed", async () => {
    const g = api({
      model: {
        dialog: null, uploading: false,
        progress: { done: 14, total: 14, label: "14 file(s) ready to submit", complete: true, failed: 0 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-header"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="stock-upload-progress-file"]')!.textContent).toBe("14 file(s) ready to submit");
  });
});
