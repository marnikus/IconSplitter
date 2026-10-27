import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
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
import { startStockUpload } from "../src/stockupload/actions";
import { applyStockSelection } from "../src/stockupload/selection";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let ui: Root, host: HTMLDivElement;
const q = (selector: string) => host.querySelector(selector) as HTMLElement;
async function click(selector: string) { await act(async () => q(selector).dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
async function input(selector: string, value: string) {
  await act(async () => {
    const el = q(selector) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submitPreset() { await act(async () => q('[data-testid="stock-preset-form"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
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
    expect((q('[data-testid="stock-upload-start"]') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain("JPEG / PNG"); expect(host.textContent).toContain("ZIP");
  });
  it("uses existing tab structures, shared bulk controls and seven-column package rows without a stock theme", async () => {
    expect(q('[data-testid="stock-upload-panel"]').matches('.svg.up')).toBe(true);
    expect(host.querySelector('[class*="stock-"]')).toBeNull();
    expect(q('[data-testid="stock-toolbar"]').classList.contains("svg-bulkbar-pin")).toBe(true);
    expect(q('[data-testid="stock-bulk"]').classList.contains("svg-bulk")).toBe(true);
    expect(host.querySelector('.svg-bulk-left input[type=checkbox]')).not.toBeNull();
    expect((q('[data-testid="stock-thumb"]') as HTMLInputElement).max).toBe("800");
    expect(q('[data-testid="stock-list"]').classList.contains("svg-panel")).toBe(true);
    expect(host.querySelector('.pair-table > .up-columns')?.children).toHaveLength(7);
    expect(q('[data-testid="stock-row"]').classList.contains("up-row")).toBe(true);
    expect(q('[data-testid="stock-row"]').children).toHaveLength(7);
    await click('[data-testid="stock-row"] .svg-file-name');
    expect(host.querySelector('.up-detail .up-meta-field textarea.svg-input[aria-label=Description]')).not.toBeNull();
    expect(host.querySelector('.up-detail [data-testid^="upload-meta-creator-"]')).not.toBeNull();
    expect(host.querySelector('.up-detail [data-testid^="upload-copy-title-"]')).not.toBeNull();
  });
  it("uses the existing inline preset name editor instead of a browser prompt", async () => {
    const prompt = vi.fn(); vi.stubGlobal("prompt", prompt);
    await click('[data-testid="stock-preset-save-open"]');
    expect(q('[data-testid="stock-preset-form"]').classList.contains("up-bg-row")).toBe(true);
    expect(q('[data-testid="stock-preset-name"]').classList.contains("svg-input")).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });
  it("confirms transfers in the existing SVG modal without launching native work on Cancel", async () => {
    const confirm = vi.fn(() => false); vi.stubGlobal("confirm", confirm);
    let task!: Promise<void>;
    await act(async () => { task = startStockUpload(stockState().rows[0].artifacts, false); });
    expect(host.querySelector('.svg-backdrop .svg-modal[role=dialog]')).not.toBeNull();
    expect(host.textContent).toContain("ftps.shutterstock.com:21");
    expect(confirm).not.toHaveBeenCalled(); expect(stockState().busy).toBe(false);
    await click('[data-testid="stock-confirm-cancel"]'); await task;
    expect(host.querySelector('[role=dialog]')).toBeNull(); expect(stockState().busy).toBe(false);
  });
  it("preserves hidden checks when the shared header toggles visible rows and disables selection during work", async () => {
    await click('[data-testid="stock-check-all"]'); expect(stockState().selection.checked).toHaveLength(2);
    await input('[aria-label="Filter exports"]', "one/");
    expect(host.querySelectorAll('[data-testid="stock-row"]')).toHaveLength(1);
    await click('[data-testid="stock-check-all"]'); expect(stockState().selection.checked).toEqual(["two/export/export.json"]);
    await click('[data-testid="stock-select-visible"]'); expect(stockState().selection.checked).toHaveLength(2);
    await click('[data-testid="stock-deselect"]'); expect(stockState().selection.checked).toEqual([]);
    await act(async () => patchStock({ busy: true }));
    expect((q('[data-testid="stock-check-all"]') as HTMLInputElement).disabled).toBe(true);
    expect((q('[data-testid="stock-select-visible"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it("saves, loads explicitly, renames and confirms removal using the SVG preset controls", async () => {
    await click('[data-testid="stock-preset-save-open"]'); await input('[data-testid="stock-preset-name"]', "JPEG and EPS"); await submitPreset();
    const raster = () => [...host.querySelectorAll('label')].find(e => e.textContent?.includes("JPEG / PNG"))!.querySelector('input')!;
    await act(async () => raster().click()); expect(raster().checked).toBe(false);
    await click('[data-testid="stock-preset-load"]'); expect(raster().checked).toBe(true);
    await click('[data-testid="stock-preset-rename"]'); await input('[data-testid="stock-preset-name"]', "Reviewed set"); await submitPreset();
    expect(host.textContent).toContain("Reviewed set");
    await click('[data-testid="stock-preset-remove"]'); await click('[data-testid="stock-preset-remove-cancel"]');
    expect(host.textContent).toContain("Reviewed set");
    await click('[data-testid="stock-preset-remove"]'); await click('[data-testid="stock-preset-remove-confirm"]');
    expect(host.textContent).not.toContain("Reviewed set"); expect(raster().checked).toBe(true);
  });
  it("rejects duplicate preset names without replacing saved formats and supports inline Escape", async () => {
    await click('[data-testid="stock-preset-save-open"]'); await input('[data-testid="stock-preset-name"]', "A"); await submitPreset();
    await click('[data-testid="stock-preset-save-open"]'); await input('[data-testid="stock-preset-name"]', "a"); await submitPreset();
    expect(host.textContent).toContain("unique name"); expect(host.querySelectorAll('#stock-preset-select option')).toHaveLength(2);
    await act(async () => q('[data-testid="stock-preset-name"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[data-testid="stock-preset-form"]')).toBeNull();
  });
  it("uses the shared metadata fields, copy buttons, word counts and validation feedback", async () => {
    const writeText = vi.fn(async () => undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    await click('[data-testid="stock-row"] .svg-file-name');
    await click('[data-testid^="upload-copy-title-"]'); expect(writeText).toHaveBeenCalledWith("A waving flag icon with pole");
    await input('[aria-label="Title"]', "Short");
    expect(q('[data-testid^="upload-meta-validation-"]').textContent).toContain("5");
    expect((host.querySelector('.up-meta-actions button') as HTMLButtonElement).disabled).toBe(true);
    await input('[aria-label="Title"]', "An edited waving flag icon with pole");
    expect((host.querySelector('.up-meta-actions button') as HTMLButtonElement).disabled).toBe(false);
  });
  it("cancels a pending confirmation on Escape and suppresses underlying row shortcuts", async () => {
    await click('[data-testid="stock-row"] .svg-file-name');
    let task!: Promise<void>;
    await act(async () => { task = startStockUpload(stockState().rows[0].artifacts, false); });
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true })));
    expect(stockState().selection.checked).toEqual([]);
    await act(async () => q('[data-testid="stock-confirm-cancel"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(q('[data-testid="stock-confirm-continue"]'));
    await act(async () => q('[data-testid="stock-confirm-continue"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    await task; expect(host.querySelector('[role=dialog]')).toBeNull();
  });
  it("does not ship an independent stock stylesheet or theme import", () => {
    expect(existsSync(resolve(process.cwd(), "src/stockupload/stock.css"))).toBe(false);
    expect(readFileSync(resolve(process.cwd(), "src/ui/Workbench.tsx"), "utf8")).not.toContain("stock.css");
  });
  it("cancels unconfirmed work when the tab is hidden and uses the existing account card controls", async () => {
    await click('[data-testid="stock-account-toggle"]');
    expect(q('[data-testid="stock-account-toggle"]').getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector('.svg-provider input[type=password].svg-input')).not.toBeNull();
    let task!: Promise<void>;
    await act(async () => { task = startStockUpload(stockState().rows[0].artifacts, false); });
    await act(async () => ui.render(<HistoryProvider><StockUploadPanel active={false} /></HistoryProvider>));
    await task; expect(host.querySelector('[role=dialog]')).toBeNull(); expect(stockState().busy).toBe(false);
  });
  it("uses the same row Enter/Space activation and nested-control isolation as SVG to upload", async () => {
    const row = q('[data-testid="stock-row"]');
    await act(async () => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(stockState().selection.active).toBe("one/export/export.json");
    expect(stockState().selection.checked).toEqual([]);
    await act(async () => row.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
    expect(stockState().selection.checked).toEqual([]);
  });
  it("uses the actual existing disclosure component/styles for rejected export folders", async () => {
    await act(async () => patchStock({ errors: ["Changed bytes — package rejected"] }));
    expect(host.querySelector('details.up-shadow-dialog > summary.up-set-group-summary')?.textContent).toContain("1 rejected");
    expect(host.querySelector('details > .up-set-group-content')?.textContent).toContain("Changed bytes");
  });
  it("keeps Batch active/check semantics, Q/E and visible selection scope", async () => {
    await click('[data-testid="stock-row"] .svg-file-name'); expect(stockState().selection.active).toBe("one/export/export.json"); expect(stockState().selection.checked).toEqual([]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true })));
    expect(stockState().selection.checked).toEqual(["one/export/export.json"]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(stockState().selection.active).toBe("two/export/export.json");
    expect(applyStockSelection({ checked: ["unknown"], active: null, anchor: null })).toBe(false);
    expect(readStockSelection({ checked: [4], active: null, anchor: null })).toBeNull();
  });
  it("reuses full badge CRUD and labels and does not put stock passwords in browser preferences", async () => {
    await act(async () => { setRowBadgeState({ v: 1, catalog: [{ id: "b", name: "Ready", color: "#123456" }], assigned: {} }); });
    await click('[data-testid="stock-row"] .svg-file-name');
    await click('[data-testid="upload-rowbadge-toggle-p"]'); await click('[data-testid="upload-rowbadge-option-p-b"]');
    expect(getRowBadgeState().assigned.p).toEqual(["b"]); expect(host.textContent).toContain("Ready");
    expect(localStorage.getItem("iconSplitter.stockUpload.preferences.v1") || "").not.toMatch(/password|username/);
  });
});
