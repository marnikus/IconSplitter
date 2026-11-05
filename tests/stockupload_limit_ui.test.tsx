// stockupload_limit_ui.test.tsx — the Upload tab's "Limit" control (2026-11-05):
// a number box beside Random batches; a limit above 0 shows Random batches as
// on (it is implied), and the confirmation says how many icons were drawn and
// how many stay for later. Starting an upload applies the limit to the plan.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimitOption, RandomBatchesOption } from "../src/stockupload/StockUploadBulkBar";
import StockUploadDialogs from "../src/stockupload/StockUploadDialogs";
import { uploadIsRandomized } from "../src/lib/stockupload/uploadlimit";
import { DEFAULT_STOCK_PREFS } from "../src/stockupload/prefsstore";
import type { StockUploadApi } from "../src/stockupload/useStockUpload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLInputElement | null;

function api(prefs: Partial<typeof DEFAULT_STOCK_PREFS>, extra: Record<string, unknown> = {}): StockUploadApi {
  return { model: { prefs: { ...DEFAULT_STOCK_PREFS, ...prefs }, dialog: null, progress: null, uploading: false }, setPrefs: vi.fn(), ...extra } as unknown as StockUploadApi;
}

beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });

describe("the Limit control", () => {
  it("stores a whole number, and an empty box as no limit", async () => {
    const g = api({});
    await act(async () => { ui.render(<LimitOption g={g} />); });
    const box = q("[data-testid=stock-upload-limit]") as HTMLInputElement;
    expect(box.value).toBe(""); // 0 shows as empty: no limit
    const type = async (v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, v);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await type("150");
    expect(g.setPrefs).toHaveBeenLastCalledWith({ uploadLimit: 150 });
    // with 150 stored, clearing the box removes the limit
    const set = api({ uploadLimit: 150 });
    await act(async () => { ui.render(<LimitOption g={set} />); });
    expect((q("[data-testid=stock-upload-limit]") as HTMLInputElement).value).toBe("150");
    await act(async () => {
      const el = q("[data-testid=stock-upload-limit]") as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(set.setPrefs).toHaveBeenLastCalledWith({ uploadLimit: 0 });
  });

  it("shows Random batches as on while a limit is set, since a limit always draws at random", async () => {
    await act(async () => { ui.render(<RandomBatchesOption g={api({ uploadLimit: 70, randomBatches: false })} />); });
    const box = q("[data-testid=stock-random-batches]") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(uploadIsRandomized({ randomBatches: false, uploadLimit: 70 })).toBe(true);
    expect(uploadIsRandomized({ randomBatches: false, uploadLimit: 0 })).toBe(false);
    expect(uploadIsRandomized({ randomBatches: true, uploadLimit: 0 })).toBe(true);
  });
});

describe("the confirmation", () => {
  it("says how many icons were drawn and how many stay for a later run", async () => {
    const plan = {
      combineTitleDescription: false, targets: [], selectedRows: [], selectedFormats: ["raster"], tasks: [], skippedMissing: [],
      warnings: [], preflightErrors: [], totalBytes: 0, limit: { limit: 150, chosen: 150, total: 200 },
    };
    const g = api({}, { model: { prefs: DEFAULT_STOCK_PREFS, dialog: { kind: "confirmUpload", plan }, progress: null, uploading: false }, confirmUpload: vi.fn(), closeDialog: vi.fn() });
    await act(async () => { ui.render(<StockUploadDialogs g={g} />); });
    expect(host.querySelector("[data-testid=stock-upload-limit-note]")?.textContent)
      .toBe("Limit 150: 150 of 200 icons drawn at random, sent in random batches of 100 — 50 stay for a later run.");
  });
});

describe("wiring", () => {
  it("starting an upload applies the limit, and the run randomizes when a limit is set", () => {
    const src = readFileSync("src/stockupload/panelops.ts", "utf8");
    expect(src).toContain("limitStockUploadPlan(");
    expect(src).toContain("uploadIsRandomized(c.model.prefs)");
  });
});
