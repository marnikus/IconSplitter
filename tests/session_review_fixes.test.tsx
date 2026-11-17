// session_review_fixes.test.tsx — the 2026-11-08 code-review findings on the
// restart snapshot: only REAL selection changes may claim the snapshot (a rescan
// that pruned nothing, a builder mount, a Selection V2 scroll must not let an
// idle page overwrite a newer selection); an outdated page still stores its own
// tab/option changes but keeps the newer selection; a repeated empty rescan
// prunes; a blocked storage is not reported as "full"; the stamp has its own key.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION } from "../src/lib/session";
import { getLogState } from "../src/log/logstore";
import { getAppState, patchStockUpload, patchUpload, patchV2, resetAppStore, setAppState } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { loadSessionState, readStoredStamp, SESSION_KEY } from "../src/state/sessionstore";
import { useSessionAutosave } from "../src/state/useSessionAutosave";
import { commitKnownSelection } from "../src/stockupload/useStockUpload";
import { pruneChecked } from "../src/upload/rowmodel";
import { syncBuilderMarks } from "../src/svgBuilder/useBuilderPersistence";
import type { UploadRow } from "../src/upload/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

function AutosaveProbe() {
  useSessionAutosave();
  return null;
}

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<HistoryProvider><AutosaveProbe /></HistoryProvider>); });
}

/** A snapshot ANOTHER page wrote a minute from now (its selection is newer than ours). */
function newerForeign(patch: Record<string, unknown>): void {
  const savedAt = new Date(Date.now() + 60_000).toISOString();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 1, savedAt, ...DEFAULT_SESSION, ...patch }));
}

const hundred = Array.from({ length: 100 }, (_, i) => `hist-${i}`);

beforeEach(() => { localStorage.clear(); resetAppStore(); vi.useRealTimers(); });
afterEach(() => { act(() => ui?.unmount()); host?.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("only real selection changes claim the snapshot", () => {
  it("a Stock upload rescan that prunes nothing writes nothing (finding 1)", () => {
    mount();
    patchStockUpload({ checked: hundred, activeId: hundred[0], anchorId: hundred[0] });
    newerForeign({ stockUpload: { checked: ["new-a", "new-b"], activeId: "new-a", anchorId: "new-a" } });
    const before = getAppState().stockUpload;
    act(() => { commitKnownSelection(hundred); });
    expect(getAppState().stockUpload).toBe(before); // no store change at all
    expect(loadSessionState().stockUpload?.checked).toEqual(["new-a", "new-b"]);
  });

  it("re-syncing unchanged builder locks / exclusions is not a gesture (finding 2)", () => {
    mount();
    act(() => { syncBuilderMarks(["a"], ["z"]); });
    newerForeign({ builder: { checked: ["n"], activeId: "n", anchorId: "n", lockedIds: [], excludedIds: [] } });
    const before = getAppState().builder;
    act(() => { syncBuilderMarks(["a"], ["z"]); }); // what a builder mount does
    expect(getAppState().builder).toBe(before);
    expect(loadSessionState().builder.checked).toEqual(["n"]);
  });

  it("a Selection V2 scroll is not a selection gesture and is not written synchronously (finding 3)", () => {
    mount();
    const spy = vi.spyOn(localStorage, "setItem");
    try {
      act(() => { patchV2({ scrollY: 480 }); });
      expect(spy).not.toHaveBeenCalled(); // debounced like any view change, not a same-task selection write
    } finally { spy.mockRestore(); }
  });
});

describe("an outdated page still stores its own non-selection changes (finding 4)", () => {
  it("keeps the newer selection from storage and writes this page's tab change", () => {
    vi.useFakeTimers();
    mount();
    newerForeign({ tab: "upload", upload: { checked: ["arch"], activeId: "arch", anchorId: "arch" } });
    act(() => { setAppState({ tab: "batch" }); });
    act(() => { vi.advanceTimersByTime(300); });
    const stored = loadSessionState();
    expect(stored.tab).toBe("batch");
    expect(stored.upload.checked).toEqual(["arch"]); // the other page's newer pick survives
  });

  it("a background notification with no change of its own writes nothing", () => {
    vi.useFakeTimers();
    mount();
    newerForeign({ tab: "upload", upload: { checked: ["arch"], activeId: "arch", anchorId: "arch" } });
    const text = localStorage.getItem(SESSION_KEY);
    act(() => { setAppState({}); }); // e.g. a scan finishing
    act(() => { vi.advanceTimersByTime(300); });
    expect(localStorage.getItem(SESSION_KEY)).toBe(text);
  });
});

describe("empty rescans and storage reports", () => {
  const row = (id: string) => ({ source: { id } }) as unknown as UploadRow;

  it("the first empty scan after start keeps restored checks; a later empty rescan prunes them (finding 5)", () => {
    patchUpload({ checked: ["a", "b"], activeId: "a", anchorId: "a" });
    pruneChecked([]); // the restore scan found nothing (folder not readable yet)
    expect(getAppState().upload.checked).toEqual(["a", "b"]);
    pruneChecked([row("a")]);
    expect(getAppState().upload.checked).toEqual(["a"]);
    pruneChecked([]); // the user emptied the folder and rescanned
    expect(getAppState().upload.checked).toEqual([]);
  });

  it("a blocked storage is reported as unavailable, not as full (finding 6)", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    try {
      mount();
      patchUpload({ checked: ["x"], activeId: "x", anchorId: "x" });
      const refused = [...getLogState().entries].reverse().find((e) => e.action === "save-refused");
      expect(refused?.detail).toMatch(/unavailable/i);
      expect(refused?.detail).not.toMatch(/full/i);
    } finally { spy.mockRestore(); }
  });

  it("the stamp is read from the document head without a full parse (finding 9)", () => {
    mount();
    patchUpload({ checked: ["x"], activeId: "x", anchorId: "x" });
    const savedAt = JSON.parse(localStorage.getItem(SESSION_KEY)!).savedAt;
    const parse = vi.spyOn(JSON, "parse");
    try { expect(readStoredStamp()).toBe(savedAt); expect(parse).not.toHaveBeenCalled(); } finally { parse.mockRestore(); }
  });
});
