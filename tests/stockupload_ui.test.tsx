import "fake-indexeddb/auto";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { MANDATORY_TAGS } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { applyBadgeToIds } from "../src/lib/upload/rowbadge";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { bootStores } from "../src/state/boot";
import { useSessionAutosave } from "../src/state/useSessionAutosave";
import { loadSessionState } from "../src/state/sessionstore";
import StockUploadPanel from "../src/stockupload/StockUploadPanel";
import { resetStockHistory } from "../src/stockupload/historystore";
import { appendStockUploadBatch, batchesForStock, resetStockUploadBatches } from "../src/stockupload/batchhistorystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { resetFtpCredentialsForTests } from "../src/stockupload/keystore";
import { loadStockPresetState, resetStockPresets, STOCK_PRESETS_KEY } from "../src/stockupload/presetstore";
import HistoryBar from "../src/ui/HistoryBar";
import { getRowBadgeState, resetRowBadges, setRowBadgeState } from "../src/upload/rowbadgestore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { settle, waitUntil } from "./helpers/quiet";
import { isMultiSelect, pickOnly } from "./helpers/multiselect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function clickEl(el: HTMLElement): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  return act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setSelect(el: HTMLSelectElement, value: string): Promise<void> {
  if (isMultiSelect(el)) return pickOnly(document, (el as HTMLElement).dataset.testid ?? "", value);
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function AutosavingStockUploadPanel() {
  useSessionAutosave();
  return <HistoryProvider><StockUploadPanel active /></HistoryProvider>;
}

function makeWorkspace(withRaster = false, itemCount = 1): FakeDir {
  const root = new FakeDir("stock_ws");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>';
  const raster = "fake JPEG preview bytes";
  const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n";

  for (let i = 0; i < itemCount; i += 1) {
    const packName = i === 0 ? "icons_a" : `icons_${i}`;
    const itemId = i === 0 ? "item-star" : `item-${i}`;
    const base = i === 0 ? "star_icon" : `icon_${i}`;
    const pack = new FakeDir(packName);
    const exp = new FakeDir("export");
    pack.children.set("export", exp);
    root.children.set(packName, pack);

    const rec = newExportRecord({
      pair: { id: itemId, base, suffix: "", dir: packName },
      source: { svgPath: `${packName}/${base}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
      settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
      svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
      epsEnabled: true,
      now: "2026-10-27T10:00:00.000Z",
    });
    rec.stage = "committed";
    rec.status = "processed";
    rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
    rec.outputs = {
      svg: { path: `${packName}/export/${base}.svg`, bytes: svg.length, hash: "sha256:s" },
      jpg: withRaster ? { path: `${packName}/export/${base}.jpg`, bytes: raster.length, hash: "sha256:j" } : null,
      eps: { path: `${packName}/export/${base}.eps`, bytes: eps.length, hash: "sha256:e" },
    };
    const json = serializeExportRecord(rec);
    exp.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
    exp.children.set(`${base}.svg`, new FakeFile(`${base}.svg`, svg.length, 1000, svg));
    exp.children.set(`${base}.eps`, new FakeFile(`${base}.eps`, eps.length, 1000, eps));
    if (withRaster) exp.children.set(`${base}.jpg`, new FakeFile(`${base}.jpg`, raster.length, 1000, raster));
    // An unrecorded stray file must not create an extra row.
    if (i === 0) exp.children.set("orphan.svg", new FakeFile("orphan.svg", svg.length, 1000, svg));
  }
  return root;
}

describe("Upload (stockUpload) tab UI", () => {
  beforeEach(async () => {
    localStorage.clear();
    stored.clear();
    clearKnownRoots();
    resetAppStore();
    resetRowBadges();
    resetStockPresets();
    resetStockHistory();
    resetStockUploadBatches();
    resetUploadJournal();
    await resetFtpCredentialsForTests();
    vi.stubGlobal("showDirectoryPicker", () => Promise.reject(new Error("picker not needed")));
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
  });

  afterEach(() => {
    act(() => ui.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens per-stock batch history and selects only the batch items visible in the current list", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });
    rememberKnownRoot(ws, "F:\\Stocks 2026\\icons testing");
    appendStockUploadBatch({
      id: "run-1", stockId: "shutterstock", stockName: "Shutterstock",
      uploadedAt: "2026-11-08T10:00:00.000Z", uploadedCount: 1, failedCount: 0,
      cancelled: false, rootPath: "F:\\Stocks 2026\\icons testing",
      files: [{ itemId: "item-star", fileName: "star_icon.svg", format: "svg",
        relPath: "icons_a/export/star_icon.svg",
        fullPath: "F:\\Stocks 2026\\icons testing\\icons_a\\export\\star_icon.svg" }],
    });
    appendStockUploadBatch({
      id: "run-2", stockId: "adobe-stock", stockName: "Adobe Stock",
      uploadedAt: "2026-11-08T11:00:00.000Z", uploadedCount: 0, failedCount: 1,
      cancelled: false, rootPath: "F:\\Stocks 2026\\icons testing", files: [],
    });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "stock row loaded");
    // The button sits in the bulk bar, right before Remove selected and Upload (2026-11-08).
    const history = q("stock-upload-history-open")!;
    expect(q("stock-bulk-right")!.contains(history)).toBe(true);
    expect(history.nextElementSibling).toBe(q("stock-remove-selected"));
    await clickEl(history);
    expect(q("stock-upload-history-dialog")).not.toBeNull();
    expect(q("stock-upload-history-batch-run-1")?.textContent).toContain("1 file");
    await setSelect(q("stock-history-stock-select") as HTMLSelectElement, "adobe-stock");
    expect(q("stock-upload-history-batch-run-2")?.textContent).toContain("0 files");
    expect(q("stock-upload-history-batch-run-1")).toBeNull();
    await setSelect(q("stock-history-stock-select") as HTMLSelectElement, "shutterstock");
    await clickEl(q("stock-upload-history-batch-run-1")!);
    expect(q("stock-history-file-run-1-0")?.textContent).toContain("star_icon.svg");
    expect(q("stock-history-location-run-1-0")?.getAttribute("title"))
      .toBe("F:\\Stocks 2026\\icons testing\\icons_a\\export\\star_icon.svg");
    await clickEl(q("stock-history-thumb-run-1-0")!);
    expect(q("stock-history-preview")).not.toBeNull();
    await clickEl(q("stock-history-preview-close")!);
    await clickEl(q("stock-history-select-files")!);
    expect(getAppState().stockUpload.checked).toEqual(["item-star"]);
  });

  it("replaces a 100-file history pick with row, history, and checkbox selections and restores the latest set", async () => {
    const ws = makeWorkspace(false, 100);
    stored.set("__stock_upload__", { source: ws });
    const itemIds = Array.from({ length: 100 }, (_, i) => i === 0 ? "item-star" : `item-${i}`);
    appendStockUploadBatch({
      id: "bulk-history-run", stockId: "shutterstock", stockName: "Shutterstock",
      uploadedAt: "2026-11-08T10:00:00.000Z", uploadedCount: 100, failedCount: 0,
      cancelled: false, rootPath: "F:\\Stocks\\icons",
      files: itemIds.map((itemId, i) => ({
        itemId, fileName: `${i === 0 ? "star_icon" : `icon_${i}`}.svg`, format: "svg",
        relPath: `icons_${i === 0 ? "a" : i}/export/${i === 0 ? "star_icon" : `icon_${i}`}.svg`,
        fullPath: null,
      })),
    });
    appendStockUploadBatch({
      id: "newer-history-run", stockId: "shutterstock", stockName: "Shutterstock",
      uploadedAt: "2026-11-08T11:00:00.000Z", uploadedCount: 2, failedCount: 0,
      cancelled: false, rootPath: "F:\\Stocks\\icons",
      files: [1, 3].map((i) => ({
        itemId: `item-${i}`, fileName: `icon_${i}.svg`, format: "svg" as const,
        relPath: `icons_${i}/export/icon_${i}.svg`, fullPath: null,
      })),
    });
    act(() => { ui.render(<StrictMode><AutosavingStockUploadPanel /></StrictMode>); });
    await waitUntil(() => q("stock-row-item-99") !== null, "100 stock rows loaded");

    await clickEl(q("stock-upload-history-open")!);
    await clickEl(q("stock-upload-history-batch-bulk-history-run")!);
    await clickEl(q("stock-history-select-files")!);
    expect(getAppState().stockUpload.checked).toHaveLength(100);
    expect(loadSessionState().stockUpload?.checked).toHaveLength(100);
    expect(host.querySelectorAll(".stock-up-row input.up-check:checked")).toHaveLength(100);

    // Choosing a row after the history bulk pick replaces that old queue item-set.
    await clickEl(q("stock-row-item-4")!);
    expect(getAppState().stockUpload.checked).toEqual(["item-4"]);
    expect(loadSessionState().stockUpload?.checked).toEqual(["item-4"]);
    expect(host.querySelectorAll(".stock-up-row input.up-check:checked")).toHaveLength(1);

    await clickEl(q("stock-upload-history-batch-newer-history-run")!);
    await clickEl(q("stock-history-select-files")!);
    let expected = ["item-1", "item-3"];
    expect(getAppState().stockUpload.checked).toEqual(expected);
    expect(loadSessionState().stockUpload?.checked).toEqual(expected);
    expect(host.querySelectorAll(".stock-up-row input.up-check:checked")).toHaveLength(2);

    await clickEl(q("stock-upload-history-backdrop")!);
    await clickEl(q("stock-check-item-3")!);
    await clickEl(q("stock-check-item-5")!);
    expected = ["item-1", "item-5"];
    expect(getAppState().stockUpload.checked).toEqual(expected);
    expect(loadSessionState().stockUpload?.checked).toEqual(expected);
    expect(host.querySelectorAll(".stock-up-row input.up-check:checked")).toHaveLength(2);

    act(() => { ui.unmount(); });
    act(() => { bootStores(); });
    ui = createRoot(host);
    act(() => { ui.render(<StrictMode><AutosavingStockUploadPanel /></StrictMode>); });
    await waitUntil(() => q("stock-row-item-99") !== null, "stock rows reloaded");
    expect(getAppState().stockUpload.checked).toEqual(expected);
    expect(loadSessionState().stockUpload?.checked).toEqual(expected);
    await waitUntil(() => host.querySelectorAll(".stock-up-row input.up-check:checked").length === 2, "restored checked rows projected");
  });

  it("groups stock configuration and filters into clearly labeled compact sections", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "stock row loaded");

    const presets = q("stock-ftp-preset-group");
    const connection = q("stock-ftp-connection-group");
    const credentials = q("stock-ftp-cred-box");
    const filters = q("stock-filters");
    expect(presets?.querySelector("legend")?.textContent).toContain("Stock preset");
    expect(connection?.querySelector("legend")?.textContent).toContain("Connection settings");
    expect(connection?.querySelector("[data-testid='stock-ftp-host']")).not.toBeNull();
    expect(credentials?.querySelector("legend")?.textContent).toContain("Sign-in & test");
    expect(q("stock-ftp-help")?.tagName).toBe("DETAILS");
    expect((q("stock-ftp-help") as HTMLDetailsElement).open).toBe(false);
    expect(filters?.querySelector("legend")?.textContent).toContain("Find & filter");
    expect(filters?.querySelector("[data-testid='stock-filter-search']")).not.toBeNull();
  });

  it("sizes the raster preview frame to the original file aspect ratio", async () => {
    const ws = makeWorkspace(true);
    stored.set("__stock_upload__", { source: ws });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stock-raster-preview");
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "stock row loaded");
    await waitUntil(() => q("stock-prev-item-star")?.getAttribute("src") === "blob:stock-raster-preview", "raster preview loaded");

    const image = q("stock-prev-item-star") as HTMLImageElement;
    const zoom = Number((q("stock-upload-zoom") as HTMLInputElement).value);
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: zoom * 2 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: zoom });
    await act(async () => { image.dispatchEvent(new Event("load", { bubbles: true })); });

    const frame = q("stock-prev-item-star-frame")!;
    expect(frame.style.width).toBe(`${zoom * 2}px`);
    expect(frame.style.height).toBe(`${zoom}px`);
  });

  it("remembers the most recently selected stock preset after reload", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "stock row loaded");

    await setSelect(q("stock-ftp-preset-select") as HTMLSelectElement, "getty-images-web");
    await settle();
    expect(JSON.parse(localStorage.getItem(STOCK_PRESETS_KEY) ?? "{}").activePresetId).toBe("getty-images-web");
    expect(loadStockPresetState().activePresetId).toBe("getty-images-web");
  });

  it("shows an aspect-preserving hover thumbnail preview and retains click-to-enlarge", async () => {
    const ws = makeWorkspace();
    const folder = (ws.children.get("icons_a") as FakeDir).children.get("export") as FakeDir;
    folder.children.set("star_icon.jpg", new FakeFile("star_icon.jpg", 12, 1000, "jpeg-preview"));
    stored.set("__stock_upload__", { source: ws });
    rememberKnownRoot(ws, "F:\\Stocks 2026\\icons testing");
    appendStockUploadBatch({
      id: "run-eps", stockId: "shutterstock", stockName: "Shutterstock",
      uploadedAt: "2026-11-08T10:00:00.000Z", uploadedCount: 1, failedCount: 0,
      cancelled: false, rootPath: "F:\\Stocks 2026\\icons testing",
      files: [{ itemId: "item-star", fileName: "star_icon.eps", format: "eps",
        relPath: "icons_a/export/star_icon.eps",
        fullPath: "F:\\Stocks 2026\\icons testing\\icons_a\\export\\star_icon.eps" }],
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:history-hover-preview");
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "stock row loaded");
    await clickEl(q("stock-upload-history-open")!);
    await clickEl(q("stock-upload-history-batch-run-eps")!);
    await waitUntil(() => q("stock-history-thumb-run-eps-0")?.querySelector("img") !== null, "EPS companion image loaded");

    const thumb = q("stock-history-thumb-run-eps-0")!;
    await act(async () => { thumb.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    const hover = q("stock-history-hover-preview-run-eps-0");
    expect(hover).not.toBeNull();
    const hoverImage = hover?.querySelector("img");
    expect(hoverImage?.getAttribute("src")).toBe("blob:history-hover-preview");
    expect(hoverImage?.style.width).toBe("auto");
    expect(hoverImage?.style.height).toBe("auto");

    await clickEl(thumb);
    expect(q("stock-history-preview")).not.toBeNull();
    const largeImage = q("stock-history-preview")?.querySelector("img");
    expect(largeImage?.getAttribute("src")).toBe("blob:history-hover-preview");
    expect(largeImage?.style.width).toBe("auto");
    expect(largeImage?.style.height).toBe("auto");
  });

  it("Ctrl-click removes an applied site badge from all checked Stock Upload rows", async () => {
    stored.set("__stock_upload__", { source: makeWorkspace() });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "row loaded");
    await clickEl(q("stock-check-item-star")!);
    await clickEl(q("upload-rowbadge-toggle-item-star")!);
    await clickEl(q("upload-rowbadge-option-item-star-shutterstock")!);
    expect(getRowBadgeState().assigned["item-star"]).toContain("shutterstock");
    await act(async () => {
      q("upload-rowbadge-chip-item-star-shutterstock")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }),
      );
    });
    await settle(0);
    expect(getRowBadgeState().assigned["item-star"] ?? []).not.toContain("shutterstock");
  });

  it("offers random 100-icon batch selection, off by default and remembered", async () => {
    stored.set("__stock_upload__", { source: makeWorkspace() });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "row loaded");
    const box = q("stock-random-batches") as HTMLInputElement;
    expect(box).not.toBeNull();
    // Nobody gets a random upload order unless they ask for it.
    expect(box.checked).toBe(false);
    await clickEl(box);
    expect(box.checked).toBe(true);
    // A saved preference, so a rerun keeps drawing batches at random.
    expect(localStorage.getItem("iconSplitter.stockUpload.prefs.v1")).toContain('"randomBatches":true');
    // Reloading the panel reads it back instead of resetting the choice.
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "row reloaded");
    expect((q("stock-random-batches") as HTMLInputElement).checked).toBe(true);
  });

  it("offers an opt-in combined title and discloses it before upload", async () => {
    stored.set("__stock_upload__", { source: makeWorkspace() });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "row loaded");
    await clickEl(q("stock-presets-open")!);
    const checkbox = q("stock-preset-shutterstock-title-description") as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
    await clickEl(checkbox);
    expect(checkbox.checked).toBe(true);
    await clickEl(q("stock-presets-close")!);
    await clickEl(q("stock-check-item-star")!);
    await clickEl(q("stock-upload-start")!);
    expect(q("stock-upload-confirm-dialog")?.textContent).toContain("Title + description");
  });

  it("discovers only export/+export.json items, manages badges & zoom, saves local-only credentials without expanding, edits metadata, and uploads selected formats with a history note", async () => {
    const ws = makeWorkspace();
    rememberKnownRoot(ws, "F:\\Stocks 2026\\icons testing");
    stored.set("__stock_upload__", { source: ws });

    const uploadedConfigs: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, ftps: { ready: true }, sftp: { ready: true } }), { status: 200 });
      }
      if (u.endsWith("/ftps/upload")) {
        const hdr = (init?.headers as Record<string, string>)?.["x-ftps-config"] ?? "";
        uploadedConfigs.push(hdr);
        return new Response(JSON.stringify({ ok: true, bytes: 42 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    act(() => {
      ui.render(
        <HistoryProvider>
          <HistoryBar />
          <StockUploadPanel active />
        </HistoryProvider>,
      );
    });

    await waitUntil(() => q("stock-row-item-star") !== null, "exported row loaded");
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(1);
    expect(q("stock-folder-path")).not.toBeNull();
    expect(q("stock-location-item-star")).not.toBeNull();

    // Shutterstock preset is selected by default
    const presetSelect = q("stock-ftp-preset-select") as HTMLSelectElement;
    expect(presetSelect.value).toBe("shutterstock");
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("ftps.shutterstock.com");

    // Save local-only credentials — inputs clear immediately and secret never appears in DOM or localStorage
    await setInput(q("stock-ftp-user") as HTMLInputElement, "my_shutter_login");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "SuperSecret#999");
    await clickEl(q("stock-ftp-cred-save")!);
    await waitUntil(() => q("stock-ftp-cred-status")?.textContent?.includes("Saved locally") === true, "creds saved");
    expect((q("stock-ftp-user") as HTMLInputElement).value).toBe("");
    expect((q("stock-ftp-pass") as HTMLInputElement).value).toBe("");
    expect(host.innerHTML).not.toContain("SuperSecret#999");
    expect(host.innerHTML).not.toContain("my_shutter_login");
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain("SuperSecret#999");
    }

    // Zoom slider updates row preview size
    await setInput(q("stock-upload-zoom") as HTMLInputElement, "180");
    await settle();
    expect(q("stock-upload-panel")?.getAttribute("style")).toContain("180px");

    // Check row & undo/redo via stockUploadChecked
    await clickEl(q("stock-check-item-star")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual(["item-star"]);
    await clickEl(q("hist-undo")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual([]);
    await clickEl(q("hist-redo")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual(["item-star"]);

    // Add a badge and apply to selected row — synced into shared rowbadgestore
    await clickEl(q("stock-rowbadges-open")!);
    await settle();
    await setInput(q("upload-rowbadge-new-name") as HTMLInputElement, "Ready");
    await clickEl(q("upload-rowbadge-add")!);
    await clickEl(q("upload-rowbadge-close")!);
    await settle();
    const badgeId = getRowBadgeState().catalog.find((b) => b.name === "Ready")!.id;
    await clickEl(q("upload-rowbadge-apply")!);
    await settle();
    await clickEl(q(`upload-rowbadge-apply-${badgeId}`)!);
    await settle();
    expect(getRowBadgeState().assigned["item-star"]).toEqual([badgeId]);

    // Click row to expand editable metadata (no AI buttons), edit & accept -> re-embeds into SVG & EPS
    await clickEl(q("stock-row-item-star")!);
    await settle();
    expect(q("stock-meta-fields-item-star")).not.toBeNull();
    await setInput(q("stock-meta-title-item-star") as HTMLInputElement, "Minimal line icon showing bright star shine");
    await setInput(q("stock-meta-description-item-star") as HTMLTextAreaElement, "Clean minimalist vector line icon showing bright shining star symbol");
    await setInput(q("stock-meta-tags-item-star") as HTMLTextAreaElement, [...MANDATORY_TAGS, "star", "shine", "astronomy", "sparkle"].join(", "));
    await clickEl(q("stock-meta-accept-item-star")!);
    await waitUntil(() => q("stock-meta-state-item-star")?.textContent?.includes("accepted") === true, "metadata accepted");

    // Choose formats: SVG + EPS + ZIP (raster off since test fixture has SVG+EPS)
    await clickEl(q("stock-presets-open")!);
    await clickEl(q("stock-preset-shutterstock-raster")!); // uncheck default raster
    await clickEl(q("stock-preset-shutterstock-svg")!);    // check svg
    await clickEl(q("stock-preset-shutterstock-zip")!);    // check zip (eps is already checked by default)
    await clickEl(q("stock-presets-close")!);
    await settle();

    // An existing stock badge skips this icon by default; opting into that site re-uploads it.
    setRowBadgeState(applyBadgeToIds(getRowBadgeState(), ["item-star"], "shutterstock"));
    await settle();

    // Click Upload -> confirmation -> sends 3 files after opting into re-upload.
    await clickEl(q("stock-upload-start")!);
    await settle();
    expect(q("stock-upload-confirm-dialog")).not.toBeNull();
    const reupload = q("stock-upload-reupload-shutterstock") as HTMLInputElement;
    expect(reupload.checked).toBe(false);
    expect((q("stock-upload-confirm-go") as HTMLButtonElement).disabled).toBe(true);
    await clickEl(reupload);
    expect((q("stock-upload-confirm-go") as HTMLButtonElement).disabled).toBe(false);
    const uploadNote = q("stock-upload-confirm-note") as HTMLTextAreaElement;
    expect(uploadNote).not.toBeNull();
    await setInput(uploadNote, "Autumn catalog refresh");
    await clickEl(q("stock-upload-confirm-go")!);
    await waitUntil(() => uploadedConfigs.length === 3, "3 files uploaded");

    const sentFiles = uploadedConfigs.map((b64) => JSON.parse(atob(b64)).fileName as string);
    expect(sentFiles).toEqual(["star_icon.svg", "star_icon.eps", "star_icon.zip"]);
    expect(getRowBadgeState().assigned["item-star"]).toEqual([badgeId, "shutterstock"]);
    await waitUntil(() => batchesForStock("shutterstock").length === 1, "upload batch history recorded");
    const savedBatch = batchesForStock("shutterstock")[0];
    expect(savedBatch).toMatchObject({ uploadedCount: 3, failedCount: 0, cancelled: false, note: "Autumn catalog refresh" });
    expect(savedBatch.files.map((file) => file.fileName))
      .toEqual(["star_icon.svg", "star_icon.eps", "star_icon.zip"]);
    expect(savedBatch.files[0].fullPath)
      .toBe("F:\\Stocks 2026\\icons testing\\icons_a\\export\\star_icon.svg");
    await clickEl(q("stock-upload-history-open")!);
    const savedHistoryRow = q(`stock-upload-history-batch-${savedBatch.id}`);
    expect(savedHistoryRow?.querySelector(".stock-history-note")?.textContent).toBe("Autumn catalog refresh");
  });

  it("supports Adobe Stock SFTP (:22) with SFTP Member ID / generated password fields, reset defaults, and standalone vector upload", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });

    let testAttempts = 0;
    const uploadedPayloads: Array<{ host: string; port: number; protocol: string; fileName: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, ftps: { ready: true }, sftp: { ready: true } }), { status: 200 });
      }
      if (u.endsWith("/ftps/test")) {
        testAttempts += 1;
        const body = JSON.parse(String(init?.body ?? "{}"));
        const fakeKey = "ab".repeat(32);
        if (body.tlsPolicy !== "pinned" || body.pinnedCertSha256 !== fakeKey) {
          return new Response(JSON.stringify({
            ok: false, code: "cert", reason: `Untrusted SSH host key (SHA-256: ${fakeKey})`, serverCertSha256: fakeKey,
          }), { status: 495 });
        }
        return new Response(JSON.stringify({ ok: true, serverCertSha256: fakeKey }), { status: 200 });
      }
      if (u.endsWith("/ftps/upload")) {
        const hdr = (init?.headers as Record<string, string>)?.["x-ftps-config"] ?? "";
        uploadedPayloads.push(JSON.parse(atob(hdr)));
        return new Response(JSON.stringify({ ok: true, bytes: 42 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    act(() => {
      ui.render(
        <HistoryProvider>
          <StockUploadPanel active />
        </HistoryProvider>,
      );
    });

    await waitUntil(() => q("stock-row-item-star") !== null, "exported row loaded");

    // Shutterstock, Adobe Stock, and Getty Images appear in the drop list AND quick-switch header buttons
    const presetSelect = q("stock-ftp-preset-select") as HTMLSelectElement;
    const optionLabels = Array.from(presetSelect.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Shutterstock", "Adobe Stock", "Getty Images", "Getty Images (web upload)"]);
    expect(q("stock-ftp-quick-shutterstock")?.textContent).toContain("Shutterstock");
    expect(q("stock-ftp-quick-adobe-stock")?.textContent).toContain("Adobe Stock");
    expect(q("stock-ftp-quick-getty-images")?.textContent).toContain("Getty Images");

    // Hardcoded stock badges live in the ONE general badge system; no Stock sites column or pending pills!
    const initialCatalog = getRowBadgeState().catalog;
    const shutterBadge = initialCatalog.find((b) => b.id === "shutterstock");
    const adobeBadge = initialCatalog.find((b) => b.id === "adobe-stock");
    const gettyBadge = initialCatalog.find((b) => b.id === "getty-images");
    expect(shutterBadge?.name).toBe("Shutterstock");
    expect(adobeBadge?.name).toBe("Adobe Stock");
    expect(gettyBadge?.name).toBe("Getty Images");
    expect(shutterBadge?.color).not.toBe(adobeBadge?.color);
    expect(adobeBadge?.color).not.toBe(gettyBadge?.color);
    expect(host.querySelector(".stock-up-columns")?.textContent).not.toContain("Stock sites");
    expect(host.querySelector("[data-testid^='stock-site-pill-']")).toBeNull();
    expect(q("stock-filter-status")).toBeNull();

    // Adding a custom stock preset immediately adds its badge to the same general catalog
    await setInput(q("stock-ftp-new-name") as HTMLInputElement, "Dreamstime");
    await clickEl(q("stock-ftp-add")!);
    await settle();
    expect(getRowBadgeState().catalog.some((b) => b.name === "Dreamstime")).toBe(true);
    await clickEl(q("stock-target-check-stock-5")!);

    // Switch stock dropdown to Adobe Stock
    await setSelect(q("stock-ftp-preset-select") as HTMLSelectElement, "adobe-stock");
    await settle();
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("sftp.contributor.adobestock.com");
    expect((q("stock-ftp-port") as HTMLInputElement).value).toBe("22");
    expect((q("stock-ftp-protocol") as HTMLSelectElement).value).toBe("sftp");
    expect(q("stock-ftp-cred-box")?.textContent).toContain("Member ID");
    expect(q("stock-ftp-cred-box")?.textContent).toContain("Generated password");

    // Edit host and verify built-in Reset restores Adobe Stock defaults
    await setInput(q("stock-ftp-host") as HTMLInputElement, "custom.example.com");
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("custom.example.com");
    await clickEl(q("stock-ftp-reset-builtin")!);
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("sftp.contributor.adobestock.com");

    // Save local-only Adobe Stock SFTP credentials without expanding them
    await setInput(q("stock-ftp-user") as HTMLInputElement, "210333617");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "AdobeGenSecret#42");
    await clickEl(q("stock-ftp-cred-save")!);
    await waitUntil(() => q("stock-ftp-cred-status")?.textContent?.includes("Saved locally") === true, "adobe creds saved");
    expect(host.innerHTML).not.toContain("210333617");
    expect(host.innerHTML).not.toContain("AdobeGenSecret#42");

    // Test connection -> prompts unknown SSH host key -> clicking Trust & pin auto-reconnects immediately (like FileZilla!)
    await clickEl(q("stock-ftp-test")!);
    await waitUntil(() => q("stock-ftp-trust-cert") !== null, "host key trust button shown");
    await clickEl(q("stock-ftp-trust-cert")!);
    await waitUntil(
      () => q("stock-ftp-test-note")?.textContent?.includes("Connected & authenticated via SFTP") === true,
      "auto-reconnected after trusting host key",
    );
    expect(testAttempts).toBe(2);
    expect(q("stock-toast")?.textContent).toContain("Connected & authenticated via SFTP");

    // Target Adobe Stock only (uncheck Shutterstock, check Adobe Stock) and upload SVG + EPS
    await clickEl(q("stock-target-check-shutterstock")!);
    await clickEl(q("stock-target-check-adobe-stock")!);
    await clickEl(q("stock-presets-open")!);
    await clickEl(q("stock-preset-adobe-stock-raster")!);
    await clickEl(q("stock-preset-adobe-stock-svg")!);
    await clickEl(q("stock-presets-close")!);
    await clickEl(q("stock-check-item-star")!);
    await settle();

    await clickEl(q("stock-upload-start")!);
    await settle();
    await clickEl(q("stock-upload-confirm-go")!);
    await waitUntil(() => uploadedPayloads.length === 2, "2 Adobe Stock vector files uploaded");

    expect(uploadedPayloads.map((p) => ({ host: p.host, port: p.port, protocol: p.protocol, fileName: p.fileName }))).toEqual([
      { host: "sftp.contributor.adobestock.com", port: 22, protocol: "sftp", fileName: "star_icon.svg" },
      { host: "sftp.contributor.adobestock.com", port: 22, protocol: "sftp", fileName: "star_icon.eps" },
    ]);

    // Adobe Stock's general badge is auto-assigned on the row; filter using the ONE general Badge filter!
    await settle();
    expect(q("upload-rowbadge-chip-item-star-adobe-stock")?.textContent).toBe("Adobe Stock");
    expect(q("upload-rowbadge-chip-item-star-shutterstock")).toBeNull();
    expect(host.querySelector("[data-testid^='stock-site-pill-']")).toBeNull();

    await setSelect(q("stock-filter-badge") as HTMLSelectElement, "adobe-stock");
    await settle();
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(1);
    await setSelect(q("stock-filter-badge") as HTMLSelectElement, "shutterstock");
    await settle();
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(0);
  });
});
