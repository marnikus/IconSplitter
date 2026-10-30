// stockupload_progress_ui.test.tsx — the cross-tab upload bar: at 100% it is a
// FINISHED bar (green, tick, closable), not a bar that looks done and keeps
// offering Cancel. The header used to disappear only when the run returned,
// which left it sitting at "100% · 0 remaining" for the whole batch tail.
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
    model: { dialog: null, uploading: true, progress: { done: 14, total: 14, phase: "verifying", label: "Getty Images: 14 of 14 file(s) ready to submit" } },
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
  it("is a finished bar at 100% and can be closed", async () => {
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

  it("does not call a bar finished while its files are only uploaded", async () => {
    // What the user saw on a real batch: every file arrived, two cards still showed
    // not_ready_to_submit, and the bar already said "100 % · Upload complete".
    const g = api({
      model: {
        dialog: null, uploading: true,
        progress: { done: 7, total: 7, phase: "uploading", label: "Getty Images: 7 of 7 file(s) uploaded" },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    const bar = mount.querySelector('[data-testid="stock-upload-progress-header"]') as HTMLElement;
    expect(bar.className).not.toContain("complete");
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Uploading to stock sites");
    // Cancel still works, and there is no ✕ on a run that is still verifying.
    expect(mount.querySelector('[data-testid="stock-progress-cancel"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="stock-progress-dismiss"]')).toBeNull();
  });

  it("says it is verifying Ready to submit while the chips flip", async () => {
    const g = api({
      model: {
        dialog: null, uploading: true,
        progress: { done: 5, total: 7, phase: "verifying", label: "Getty Images: 5 of 7 file(s) ready to submit" },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Verifying Ready to submit");
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).toBe("71%");
    expect(mount.querySelector('[data-testid="stock-upload-progress-header"]')!.className).not.toContain("complete");
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
        progress: { done: 14, total: 14, label: "13 file(s) uploaded, 1 failed", complete: true, failed: 1 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Upload finished with errors");
    expect(mount.querySelector('[data-testid="stock-progress-dismiss"]')).not.toBeNull();
  });

  it("never paints a run that uploaded nothing as a full green bar", async () => {
    // 418 failed, 0 uploaded: the bar used to read "418 completed / 418 · 100 %"
    // in green, which is the opposite of what happened.
    const g = api({
      model: {
        dialog: null, uploading: false,
        progress: { done: 0, total: 418, label: "Uploaded 0 file(s), 418 failed", complete: true, failed: 418 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent)
      .toBe("Upload failed — nothing was uploaded");
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).toBe("0%");
    expect(mount.querySelector('[data-testid="stock-upload-progress-completed"]')!.textContent)
      .toBe("0 completed / 418");
    const bar = mount.querySelector('[data-testid="stock-upload-progress-header"]') as HTMLElement;
    // Green is reserved for a run that really uploaded: a failure is not success.
    expect(bar.className).not.toContain("complete");
    expect(bar.className).toContain("failed");
  });

  it("counts the files that uploaded, not the ones that were processed", async () => {
    const g = api({
      model: {
        dialog: null, uploading: false,
        progress: { done: 3, total: 5, label: "Uploaded 3 file(s), 2 failed", complete: true, failed: 2 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-percent"]')!.textContent).toBe("60%");
    expect(mount.querySelector('[data-testid="stock-upload-progress-remaining"]')!.textContent).toBe("2 remaining");
    expect(mount.querySelector('[data-testid="stock-upload-progress-title"]')!.textContent).toBe("Upload finished with errors");
  });

  it("stays on screen after the run returns, until it is closed", async () => {
    const g = api({
      model: {
        dialog: null, uploading: false,
        progress: { done: 14, total: 14, label: "14 file(s) uploaded, 0 failed", complete: true, failed: 0 },
      },
    } as Partial<StockUploadApi>);
    await render(g);
    expect(mount.querySelector('[data-testid="stock-upload-progress-header"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="stock-upload-progress-file"]')!.textContent).toBe("14 file(s) uploaded, 0 failed");
  });
});
