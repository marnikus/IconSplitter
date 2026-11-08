// session_selection_persist.test.tsx — the restart snapshot keeps the user's
// LAST selection (2026-11-08). The report: a new selection is never stored and
// the 100 checks picked before come back after every reload. The contracts
// pinned here: a check gesture writes the selection document in the SAME task;
// the selection lives in its own key, so a page still running an older build
// (which writes only the session snapshot) cannot resurrect the old checks; a
// scan that found nothing empties nothing; a refused write is retried, never
// lost silently; a hidden tab flushes.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots } from "../src/lib/knownroots";
import { DEFAULT_SESSION } from "../src/lib/session";
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
/** The selection document: the ONE owner of what is checked (2026-11-08). */
const SELECTION_KEY = "iconSplitter.selection.v1";

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

const check = (id: string) => act(async () => { (q(`upload-check-${id}`) as HTMLElement).click(); });

/** The browser's "this tab is hidden now" signal, as a frozen/discarded tab sees it. */
function hideDocument(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
}

function readJson(key: string): Record<string, unknown> | null {
  const text = localStorage.getItem(key);
  return text === null ? null : (JSON.parse(text) as Record<string, unknown>);
}

/** A selection document as a page of THIS build writes it. */
function selectionDoc(checked: string[], savedAt: string): Record<string, unknown> {
  return {
    v: 1, savedAt,
    upload: { checked, activeId: checked[0] ?? null, anchorId: checked[0] ?? null },
    stockUpload: { checked: [], activeId: null, anchorId: null },
    svg: { checked: [], activeId: null, anchorId: null },
    builder: { checked: [], activeId: null, anchorId: null },
    batch: { checked: [], activeId: null, anchorId: null },
    v2: { checked: [], scrollY: 0, anchorId: null },
  };
}

/** A session snapshot as an OLDER build writes it: it still carries the checks. */
function legacySession(checked: string[], savedAt: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    v: 1, savedAt, ...DEFAULT_SESSION, tab: "upload",
    upload: { checked, activeId: checked[0] ?? null, anchorId: checked[0] ?? null },
  }));
}

const hundred = () => Array.from({ length: 100 }, (_, i) => `old-${i}`);

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

describe("the last selection survives the reload", () => {
  it("stores an SVG to upload check in the same task as the click", async () => {
    handles.set("__upload__", { source: approvedUploadRoot() });
    await mountUpload();
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [] });

    await check(FOG);
    // No timer has been advanced: the gesture itself is the write.
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [FOG] });
  });

  it("keeps an idle page of an OLDER build from resurrecting the previous 100 checks", () => {
    // This build stored the new pick…
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selectionDoc([ARCH], new Date().toISOString())));
    // …and a page still running the older build flushes its stale 100 checks
    // into the session snapshot, stamped later than anything else.
    legacySession(hundred(), new Date(Date.now() + 1000).toISOString());
    bootStores();
    expect(getAppState().upload.checked).toEqual([ARCH]);
  });

  it("restores a checked set saved by an older build that has no selection document yet", () => {
    legacySession([FOG, ARCH], new Date().toISOString());
    bootStores();
    expect(getAppState().upload.checked).toEqual([FOG, ARCH]);
  });

  it("keeps the checked ids out of the session snapshot", async () => {
    handles.set("__upload__", { source: approvedUploadRoot() });
    await mountUpload();
    await check(FOG);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect((readJson(SESSION_KEY)?.upload as { checked: string[] }).checked).toEqual([]);
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [FOG] });
  });

  it("never overwrites a selection document another page wrote after this page's last change", () => {
    mountUi(<AutosaveProbe />);
    patchUpload({ checked: [FOG], activeId: FOG, anchorId: FOG });
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [FOG] });

    const later = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selectionDoc([ARCH], later)));
    act(() => { window.dispatchEvent(new Event("pagehide")); }); // an idle page leaving
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [ARCH] }); // the newer pick survives
  });

  it("keeps a remembered selection when the rescan finds nothing to check", async () => {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selectionDoc([FOG], new Date().toISOString())));
    bootStores();
    expect(getAppState().upload.checked).toEqual([FOG]);
    handles.set("__upload__", { source: approvedUploadRoot(FOLDER, []) }); // nothing listable
    await mountUpload();
    expect(q(`upload-row-${FOG}`)).toBeNull();
    expect(getAppState().upload.checked).toEqual([FOG]);
    expect(readJson(SELECTION_KEY)?.upload).toMatchObject({ checked: [FOG] });
  });

  it("retries a refused write instead of silently keeping the older selection", () => {
    mountUi(<AutosaveProbe />);
    patchBatch({ checked: ["first"], activeId: "first", anchorId: "first" });
    const real = localStorage.setItem.bind(localStorage);
    let refusals = 1;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === SELECTION_KEY && refusals > 0) { refusals -= 1; throw new DOMException("full", "QuotaExceededError"); }
      real(key, value);
    });
    patchBatch({ checked: ["second"], activeId: "second", anchorId: "second" });
    spy.mockRestore();
    expect(readJson(SELECTION_KEY)?.batch).toMatchObject({ checked: ["second"] });
  });

  it("flushes a pending debounced change when the page is hidden, so a frozen tab keeps it", () => {
    mountUi(<AutosaveProbe />);
    patchView({ filter: { ...getAppState().view.filter, search: "nebula" } });
    expect(loadSessionState().selection.filter.search).not.toBe("nebula"); // debounced, not yet
    hideDocument();
    expect(loadSessionState().selection.filter.search).toBe("nebula");
  });

  it("writes the session snapshot it was given (the reload path stays intact)", () => {
    expect(saveSessionState({ ...DEFAULT_SESSION, tab: "upload" }, new Date().toISOString())).toBe(true);
    expect(loadSessionState().tab).toBe("upload");
  });

  it("replaces a 100-id Stock Upload pick at once, as the report asked", () => {
    mountUi(<AutosaveProbe />);
    patchStockUpload({ checked: hundred(), activeId: "old-0", anchorId: "old-0" });
    expect(readJson(SELECTION_KEY)?.stockUpload).toMatchObject({ checked: hundred() });

    patchStockUpload({ checked: [ARCH], activeId: ARCH, anchorId: ARCH });
    expect(readJson(SELECTION_KEY)?.stockUpload).toMatchObject({ checked: [ARCH] });
  });
});
