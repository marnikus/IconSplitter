// history_ui.test.tsx — the global undo/redo surface (design doc §5): disabled
// states, next-action labels, the keyboard shortcuts, the visible timeline and
// restart survival. Entries are pushed the way a panel pushes them and undone
// through the real apply path, so a store change is what proves it worked.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppState, resetAppStore, setAppState } from "../src/state/appstore";
import type { HistoryApi } from "../src/state/HistoryProvider";
import { loadHistory } from "../src/state/historystore";
import { mountHistory, type HistoryHarness } from "./helpers/historymount";

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

const pad = () => getAppState().sheets.padding;

function sheetsEntry(after: typeof SHEETS_6, label: string): void {
  api.push({ type: "sheets", label, origin: "sheets", ids: ["padding"], before: { ...SHEETS_6 }, after: { ...after } });
}

describe("the controls", () => {
  it("starts disabled and says there is nothing to undo", () => {
    expect(h.btn("[data-testid='hist-undo']").disabled).toBe(true);
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(true);
    expect(h.q("[data-testid='hist-label']")?.textContent).toBe("Nothing to undo");
    expect(h.q("[data-testid='hist-open']")?.textContent).toContain("History (0)");
    expect(h.q("[data-testid='hist-panel']")).toBeNull(); // closed until asked for
  });

  it("names the action an undo would reverse, in the label and the tooltip", () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    expect(h.q("[data-testid='hist-label']")?.textContent).toBe("Undo: Padding 12%");
    expect(h.btn("[data-testid='hist-undo']").title).toContain("Undo: Padding 12%");
    expect(h.btn("[data-testid='hist-undo']").disabled).toBe(false);
  });

  it("undoes through the same path a normal change uses", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.click("[data-testid='hist-undo']");
    expect(pad()).toBe(6);
    expect(h.btn("[data-testid='hist-undo']").disabled).toBe(true);
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(false);
  });

  it("redoes the most recently undone action", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.click("[data-testid='hist-undo']");
    await h.click("[data-testid='hist-redo']");
    expect(pad()).toBe(12);
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(true);
  });

  it("drops the redo branch as soon as a new action arrives", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    act(() => setAppState({ sheets: { ...SHEETS_6, size: 1024 } }));
    act(() => api.push({ type: "sheets", label: "Size 1024", origin: "sheets", ids: ["size"], before: SHEETS_12, after: { ...SHEETS_6, size: 1024 } }));
    await h.click("[data-testid='hist-undo']");
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(false);
    act(() => sheetsEntry({ ...SHEETS_6, size: 2048 }, "Size 2048"));
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(true); // the undone action is gone
  });

  it("lists the timeline newest first and marks where the cursor is", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    act(() => api.push({ type: "checked", label: "Select 3 rows", origin: "selectionV2", ids: ["a"], before: [], after: ["a"] }));
    await h.click("[data-testid='hist-undo']");
    await h.click("[data-testid='hist-open']");
    const items = [...h.host.querySelectorAll("[data-testid^='hist-item-']")];
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Select 3 rows"),
      expect.stringContaining("Padding 12%"),
    ]);
    // after undoing the newest action the cursor sits on the entry before it
    expect(items[0].getAttribute("data-current")).toBeNull();
    expect(items[1].getAttribute("data-current")).not.toBeNull();
  });
});

describe("the History window", () => {
  it("opens on the button and closes on the close button or Escape", async () => {
    await h.click("[data-testid='hist-open']");
    expect(h.q("[data-testid='hist-panel']")).not.toBeNull();
    expect(h.q("[data-testid='hist-panel']")?.getAttribute("role")).toBe("dialog");
    await h.click("[data-testid='hist-close']");
    expect(h.q("[data-testid='hist-panel']")).toBeNull();

    await h.click("[data-testid='hist-open']");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(h.q("[data-testid='hist-panel']")).toBeNull();
  });

  it("counts the changes and undoes/redoes from inside the window", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.click("[data-testid='hist-open']");
    expect(h.q("[data-testid='hist-panel-count']")?.textContent).toContain("1 change");
    expect(h.q("[data-testid='hist-panel-items']")?.textContent).toContain("Padding 12%");

    await h.click("[data-testid='hist-panel-undo']");
    expect(pad()).toBe(6);
    expect(h.btn("[data-testid='hist-panel-redo']").disabled).toBe(false);
    await h.click("[data-testid='hist-panel-redo']");
    expect(pad()).toBe(12);
    expect(h.btn("[data-testid='hist-panel-undo']").disabled).toBe(false);
  });

  it("says so when there is nothing recorded yet", async () => {
    await h.click("[data-testid='hist-open']");
    expect(h.q("[data-testid='hist-panel-items']")?.textContent).toContain("No changes yet");
    expect(h.btn("[data-testid='hist-panel-undo']").disabled).toBe(true);
    expect(h.btn("[data-testid='hist-panel-redo']").disabled).toBe(true);
  });
});

describe("keyboard", () => {
  it("Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.chord("z");
    expect(pad()).toBe(6);
    await h.chord("z", true);
    expect(pad()).toBe(12);
    await h.chord("z");
    await h.chord("y");
    expect(pad()).toBe(12);
  });

  it("leaves Ctrl+Z alone while the user is typing in a field", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.chord("z", false, input);
    expect(pad()).toBe(12); // the browser's own text undo keeps working
    input.remove();
  });

  it("ignores a plain Z", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true })));
    expect(pad()).toBe(12);
  });
});

describe("restart", () => {
  it("brings the timeline and its cursor back after a remount", async () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => sheetsEntry(SHEETS_12, "Padding 12%"));
    await h.click("[data-testid='hist-undo']");
    expect(loadHistory().index).toBe(-1);
    h.unmount();
    h = mountHistory((a) => { api = a; });
    expect(h.btn("[data-testid='hist-undo']").disabled).toBe(true);
    expect(h.btn("[data-testid='hist-redo']").disabled).toBe(false);
    await h.click("[data-testid='hist-redo']");
    expect(pad()).toBe(12);
  });
});
