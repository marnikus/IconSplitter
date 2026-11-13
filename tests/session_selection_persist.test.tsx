// session_selection_persist.test.tsx — the restart snapshot keeps the user's
// LAST selection (2026-11-08). The report: a new selection was never stored and
// the 100 checks picked before came back after every reload. The contracts
// pinned here: a check gesture writes the snapshot in the SAME task; a page may
// never resurrect a selection another page already replaced; a scan that found
// nothing empties nothing; and a refused write is retried, never lost silently.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots } from "../src/lib/knownroots";
import { DEFAULT_SESSION } from "../src/lib/session";
import { getLogState } from "../src/log/logstore";
import { getAppState, patchBatch, patchStockUpload, patchUpload, patchView, resetAppStore } from "../src/state/appstore";
import { bootStores } from "../src/state/boot";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { loadSessionState, saveSessionState, SESSION_KEY } from "../src/state/sessionstore";
import { useSessionAutosave } from "../src/state/useSessionAutosave";
import UploadPanel from "../src/upload/UploadPanel";
import { forgetRestoreNote } from "../src/upload/jobstore";
import { approvedUploadRoot, uploadPairId } from "./helpers/uploadroot";
import { waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handles = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, value: unknown) => { handles.set(name, value); }),
    loadHandles: vi.fn(async (name: string) => handles.get(name) ?? null),
  };
});

const FOLDER = "architecture";
const FOG = uploadPairId(FOLDER, "fog");
const ARCH = uploadPairId(FOLDER, "arch");

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

/** The shell's autosave without the rest of the shell. */
function AutosaveProbe() {
  useSessionAutosave();
  return null;
}

function mountUi(children: React.ReactNode): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<HistoryProvider>{children}</HistoryProvider>); });
}

/** Mount the real panel and wait for its scan to settle (rows may be empty). */
async function mountUpload(): Promise<void> {
  mountUi(<><AutosaveProbe /><UploadPanel /></>);
  await waitUntil(() => q("upload-audit") !== null, "the upload audit line");
  await waitUntil(() => q("upload-busy") === null, "the scan to finish");
}

/** The browser's "this tab is hidden now" signal, as a frozen/discarded tab sees it. */
function hideDocument(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
}

const check = (id: string) => act(async () => { (q(`upload-check-${id}`) as HTMLElement).click(); });

/** A snapshot as ANOTHER page would have written it, stamped in the future. */
function foreignSnapshot(checked: string[], savedAt: string): void {
  writeStored({ checked, savedAt });
}

function writeStored(upload: { checked: string[]; savedAt: string }): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    v: 1, savedAt: upload.savedAt, ...DEFAULT_SESSION, tab: "upload",
    upload: { checked: upload.checked, activeId: upload.checked[0] ?? null, anchorId: upload.checked[0] ?? null },
  }));
}

beforeEach(() => {
  localStorage.clear();
  handles.clear();
  clearKnownRoots();
  resetAppStore();
  forgetRestoreNote();
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker =
    () => Promise.reject(new Error("no picker"));
});

afterEach(() => {
  act(() => ui.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("the restart snapshot keeps the last selection", () => {
  it("stores an SVG to upload check in the same task as the click", async () => {
    handles.set("__upload__", { source: approvedUploadRoot() });
    await mountUpload();
    expect(loadSessionState().upload.checked).toEqual([]);

    await check(FOG);
    // No timer has been advanced: the gesture itself is the write.
    expect(loadSessionState().upload.checked).toEqual([FOG]);
  });

  it("stores a Stock Upload replacement immediately, so a reload cannot bring back the previous pick", () => {
    mountUi(<AutosaveProbe />);
    const previous = Array.from({ length: 100 }, (_, i) => `old-${i}`);
    patchStockUpload({ checked: previous, activeId: previous[0], anchorId: previous[0] });
    expect(loadSessionState().stockUpload?.checked).toEqual(previous);

    patchStockUpload({ checked: [ARCH], activeId: ARCH, anchorId: ARCH });
    expect(loadSessionState().stockUpload?.checked).toEqual([ARCH]);
  });

  it("never overwrites a snapshot another page wrote after this page's last change", () => {
    mountUi(<AutosaveProbe />);
    patchUpload({ checked: [FOG], activeId: FOG, anchorId: FOG });
    expect(loadSessionState().upload.checked).toEqual([FOG]);

    const later = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    foreignSnapshot([ARCH], later);
    act(() => { window.dispatchEvent(new Event("pagehide")); }); // an idle page leaving
    expect(loadSessionState().upload.checked).toEqual([ARCH]); // the newer pick survives
  });

  it("the user's Upload flow: an idle old page holding 100 checks cannot bring them back over the newer 2", () => {
    mountUi(<AutosaveProbe />); // this page = the OLD tab, still holding the "Upload history" pick
    const hundred = Array.from({ length: 100 }, (_, i) => `hist-${i}`);
    patchStockUpload({ checked: hundred, activeId: hundred[0], anchorId: hundred[0] });
    // The NEW tab (opened later by run_app / the helper) deselects all, then checks 2 rows, and stores that.
    const later = new Date(Date.now() + 60 * 1000).toISOString();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 1, savedAt: later, ...DEFAULT_SESSION, tab: "stockUpload",
      stockUpload: { checked: ["new-a", "new-b"], activeId: "new-b", anchorId: "new-a" } }));
    // The old tab now gets an unrelated notification (a scan finishing) and later closes.
    act(() => { patchView({}); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    act(() => { window.dispatchEvent(new Event("beforeunload")); });
    expect(loadSessionState().stockUpload?.checked).toEqual(["new-a", "new-b"]); // what the reload restores
    expect(loadSessionState().tab).toBe("stockUpload");
  });

  it("a FULL storage: frees rebuildable caches first and stores the new selection (the reported save-refused bug)", () => {
    const LIMIT = 33_500; // chars, a tiny stand-in for the browser's ~5 MB quota
    const realSet = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((key: string, value: string) => {
      let used = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k !== key) used += k.length + (localStorage.getItem(k) ?? "").length; }
      if (used + key.length + value.length > LIMIT) throw new DOMException("quota", "QuotaExceededError");
      realSet(key, value);
    });
    try {
      realSet("iconSplitter.upload.sourceHash.v1", "h".repeat(25_000)); // rebuildable cache hogging space
      realSet("iconSplitter.stockUpload.batches.v1", "b".repeat(8_000)); // user data: must survive
      mountUi(<AutosaveProbe />);
      const hundred = Array.from({ length: 100 }, (_, i) => `hist-${i}`);
      patchStockUpload({ checked: hundred, activeId: hundred[0], anchorId: hundred[0] });
      patchStockUpload({ checked: ["new-a", "new-b"], activeId: "new-b", anchorId: "new-a" });
      expect(loadSessionState().stockUpload?.checked).toEqual(["new-a", "new-b"]);
      expect(localStorage.getItem("iconSplitter.upload.sourceHash.v1")).toBeNull(); // the cache made room
      expect(localStorage.getItem("iconSplitter.stockUpload.batches.v1")).toHaveLength(8_000); // upload history kept
    } finally { spy.mockRestore(); }
  });

  it("when nothing can be freed, the refusal names the largest storage keys", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    try {
      mountUi(<AutosaveProbe />);
      patchStockUpload({ checked: ["x"], activeId: "x", anchorId: "x" });
      const refused = [...getLogState().entries].reverse().find((e) => e.action === "save-refused");
      expect(refused?.level).toBe("error");
      expect(refused?.detail).toMatch(/largest stored keys/i);
    } finally { spy.mockRestore(); }
  });

  it("keeps a remembered selection when the rescan finds nothing to check", async () => {
    const openedAt = new Date().toISOString();
    writeStored({ checked: [FOG], savedAt: openedAt });
    bootStores();
    expect(getAppState().upload.checked).toEqual([FOG]);
    handles.set("__upload__", { source: approvedUploadRoot(FOLDER, []) }); // nothing listable
    await mountUpload();
    expect(q(`upload-row-${FOG}`)).toBeNull();
    expect(getAppState().upload.checked).toEqual([FOG]);
    expect(loadSessionState().upload.checked).toEqual([FOG]);
  });

  it("retries a refused write instead of silently keeping the older selection", () => {
    mountUi(<AutosaveProbe />);
    patchBatch({ checked: ["first"], activeId: "first", anchorId: "first" });
    const real = localStorage.setItem.bind(localStorage);
    let refusals = 1;
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((key: string, value: string) => {
      if (key === SESSION_KEY && refusals > 0) { refusals -= 1; throw new DOMException("full", "QuotaExceededError"); }
      real(key, value);
    });
    patchBatch({ checked: ["second"], activeId: "second", anchorId: "second" });
    spy.mockRestore();
    expect(loadSessionState().batch.checked).toEqual(["second"]);
  });

  it("flushes a pending debounced change when the page is hidden, so a frozen tab keeps it", () => {
    mountUi(<AutosaveProbe />);
    patchView({ filter: { ...getAppState().view.filter, search: "nebula" } });
    expect(loadSessionState().selection.filter.search).not.toBe("nebula"); // debounced, not yet
    hideDocument();
    expect(loadSessionState().selection.filter.search).toBe("nebula");
  });

  it("writes a snapshot that was read from storage normally (the reload path)", () => {
    const stored = saveSessionState({ ...DEFAULT_SESSION, tab: "upload" }, new Date().toISOString());
    expect(stored).toEqual({ ok: true, freed: [], reason: null });
    expect(loadSessionState().tab).toBe("upload");
  });
});
