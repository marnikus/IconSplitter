import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryProvider } from "../src/state/HistoryProvider";
import StockUploadPanel from "../src/stockupload/StockUploadPanel";
import { patchStock, stockState } from "../src/stockupload/state";
import { readStockRecord } from "../src/lib/stockupload/record";
import { readStockSelection } from "../src/lib/stockupload/selection";
import { EMPTY_ROW_BADGES } from "../src/lib/upload/rowbadge";
import { setRowBadgeState, getRowBadgeState } from "../src/upload/rowbadgestore";
import { rawRecord } from "./helpers/stockrecord";
import { applyStockSelection } from "../src/stockupload/selection";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let ui: Root, host: HTMLDivElement;
const q = (selector: string) => host.querySelector(selector) as HTMLElement;
async function click(selector: string) { await act(async () => q(selector).dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
beforeEach(() => {
  localStorage.clear(); setRowBadgeState(EMPTY_ROW_BADGES);
  patchStock({ root: null, rows: [readStockRecord(rawRecord(), "one/export")!, readStockRecord(rawRecord(), "two/export")!], errors: [], receipts: [], busy: false, canCancel: false, selection: { active: null, checked: [], anchor: null } });
  host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host);
  act(() => ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>));
});
afterEach(() => { act(() => ui.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe("separate exported-file Upload UI", () => {
  it("does not launch a host on opening, preserves formats and shows offline installation requirement", () => {
    expect(host.textContent).toContain("optional extension edition"); expect(host.querySelectorAll('[data-testid="stock-row"]')).toHaveLength(2);
    expect((q('.stock-toolbar button.primary') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain("JPEG / PNG"); expect(host.textContent).toContain("ZIP");
  });
  it("keeps Batch active/check semantics, Q/E and visible selection scope", async () => {
    await click('[data-testid="stock-row"] strong'); expect(stockState().selection.active).toBe("one/export/export.json"); expect(stockState().selection.checked).toEqual([]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true })));
    expect(stockState().selection.checked).toEqual(["one/export/export.json"]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(stockState().selection.active).toBe("two/export/export.json");
    expect(applyStockSelection({ checked: ["unknown"], active: null, anchor: null })).toBe(false);
    expect(readStockSelection({ checked: [4], active: null, anchor: null })).toBeNull();
  });
  it("reuses full badge CRUD and labels and does not put stock passwords in browser preferences", async () => {
    await act(async () => { setRowBadgeState({ v: 1, catalog: [{ id: "b", name: "Ready", color: "#123456" }], assigned: {} }); });
    await click('[data-testid="stock-row"] strong');
    await click('[data-testid="upload-rowbadge-toggle-p"]'); await click('[data-testid="upload-rowbadge-option-p-b"]');
    expect(getRowBadgeState().assigned.p).toEqual(["b"]); expect(host.textContent).toContain("Ready");
    expect(localStorage.getItem("iconSplitter.stockUpload.preferences.v1") || "").not.toMatch(/password|username/);
  });
});
