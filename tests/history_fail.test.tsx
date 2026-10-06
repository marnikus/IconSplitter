// history_fail.test.tsx — a failed apply must not corrupt the timeline.
// The apply path is forced to fail the way a read-only folder, a vanished pair
// or a foreign entry kind would, and the cursor must stay exactly where it was:
// nothing half-applied, nothing silently skipped (design doc §4).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppState, resetAppStore, setAppState } from "../src/state/appstore";
import type { HistoryApi } from "../src/state/HistoryProvider";
import { loadHistory } from "../src/state/historystore";
import { mountHistory, type HistoryHarness } from "./helpers/historymount";

vi.mock("../src/state/apply", () => ({ applyEntry: vi.fn(async () => false) }));

const SHEETS_6 = { padding: 6, size: 512, transparent: false };
const SHEETS_12 = { padding: 12, size: 512, transparent: false };

let h: HistoryHarness;
let api: HistoryApi;

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
  h = mountHistory((a) => { api = a; });
});

afterEach(() => h.unmount());

function pushedPadding(): void {
  act(() => setAppState({ sheets: SHEETS_12 }));
  act(() => api.push({ type: "sheets", label: "Padding 12%", origin: "sheets", ids: ["padding"], before: SHEETS_6, after: SHEETS_12 }));
}

describe("when an apply fails", () => {
  it("says so, changes nothing and leaves the cursor on the same entry", async () => {
    pushedPadding();
    await h.click("[data-testid='hist-undo']");
    expect(h.q("[data-testid='hist-error']")?.textContent).toContain("could not be reversed");
    expect(getAppState().sheets.padding).toBe(12); // no half-applied value
    expect(loadHistory().index).toBe(0); // cursor unmoved
    expect(h.btn("[data-testid='hist-undo']").disabled).toBe(false); // still undoable
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(true);
  });

  it("does not open a redo branch for an undo that never happened", async () => {
    pushedPadding();
    await h.click("[data-testid='hist-undo']");
    await h.click("[data-testid='hist-redo']"); // disabled: there is nothing undone
    expect(loadHistory().index).toBe(0);
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(true);
    expect(h.q("[data-testid='hist-label']")?.textContent).toBe("Undo: Padding 12%");
  });

  it("clears the warning once a later action succeeds in being recorded", async () => {
    pushedPadding();
    await h.click("[data-testid='hist-undo']");
    expect(h.q("[data-testid='hist-error']")).not.toBeNull();
    act(() => api.push({ type: "checked", label: "Select 1 row", origin: "selectionV2", ids: ["a"], before: [], after: ["a"] }));
    expect(h.q("[data-testid='hist-error']")).toBeNull();
  });
});
