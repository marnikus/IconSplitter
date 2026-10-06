// selection_ui.test.tsx — RULE 8: DOM-level smoke for the Selection panel:
// folder pick -> scan -> list rows -> hotkey decision -> text status chips
// (a11y §11 verified in rendered markup, not just pure helpers).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import SelectionPanel from "../src/selection/SelectionPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { resetAppStore } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The reported tree: unsplit sheets at the root, the batch's pieces under it. */
function batchRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
  const split = new FakeDir("split_01");
  split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  split.children.set("icon-sheet_AI_01.png", new FakeFile("icon-sheet_AI_01.png", 20, 1200, "e"));
  const sheet = new FakeDir("icon-sheet_AI");
  sheet.children.set("split_01", split);
  const run = new FakeDir("2026-10-01_10-24-31");
  run.children.set("icon-sheet_AI", sheet);
  const month = new FakeDir("2026-10");
  month.children.set("2026-10-01_10-24-31", run);
  const out = new FakeDir("_split_output");
  out.children.set("2026-10", month);
  root.children.set("_split_output", out);
  return root;
}

function fakeRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  const camp = new FakeDir("camp");
  camp.children.set("a.png", new FakeFile("a.png", 5, 111, "x"));
  camp.children.set("a_AI.png", new FakeFile("a_AI.png", 9, 222, "y"));
  root.children.set("camp", camp);
  return root;
}

describe("SelectionPanel in a DOM", () => {
  beforeAll(() => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(fakeRoot());
  });

  it("picks a folder, lists the pair, and decides via A/D hotkeys with text chips", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root: Root = createRoot(el);
    resetAppStore();
    await act(async () => { root.render(<HistoryProvider><SelectionPanel /></HistoryProvider>); });
    const pick = el.querySelector("[data-testid='sel-open-folder']") as HTMLButtonElement;
    expect(pick).toBeTruthy();
    expect(pick.textContent).toBe("Open folder");
    expect(pick.className).toContain("folder-open");
    await act(async () => { pick.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle();
    const row = el.querySelector("[data-testid^='sel-row-']");
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain("Pending"); // text, not colour alone
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })); });
    await settle();
    expect(el.querySelector("[data-testid='sel-status']")?.textContent).toContain("Approved");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true })); });
    await settle();
    expect(el.querySelector("[data-testid='sel-status']")?.textContent).toContain("Declined");
    expect(el.querySelector("[data-testid='sel-count-declined']")?.textContent).toContain("1");
    await act(async () => { root.unmount(); });
  });

  it("scopes a batch tree to its split output and states the scope", async () => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(batchRoot());
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root: Root = createRoot(el);
    resetAppStore();
    await act(async () => { root.render(<HistoryProvider><SelectionPanel /></HistoryProvider>); });
    const pick = el.querySelector("[data-testid='sel-open-folder']") as HTMLButtonElement;
    await act(async () => { pick.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle();
    expect(el.querySelector("[data-testid='sel-scope']")?.textContent).toContain("Scope: split output only");
    // the unsplit sheet at the root is the batch's input, not a reviewable pair
    expect(el.querySelectorAll("[data-testid^='sel-row-']")).toHaveLength(1);
    await act(async () => { root.unmount(); });
  });

  it("offers one green Open folder button and the read-only path row, with no watcher", async () => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(fakeRoot());
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root: Root = createRoot(el);
    resetAppStore();
    await act(async () => { root.render(<HistoryProvider><SelectionPanel /></HistoryProvider>); });
    // the empty state carries the same control, so the action is the same word
    // wherever the eye lands (I-44)
    const empty = el.querySelector("[data-testid='sel-open-folder-empty']") as HTMLButtonElement;
    expect(empty.textContent).toBe("Open folder");
    expect(empty.className).toContain("folder-open");
    expect(empty.closest("section")?.textContent).toContain("Pick the folder that holds your originals");
    await act(async () => {
      (el.querySelector("[data-testid='sel-open-folder']") as HTMLButtonElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    // the row shows the folder's own name while no full path was captured (I-46)
    expect(el.querySelector("[data-testid='sel-folder-path']")?.textContent).toContain("test_processing");
    expect(el.querySelector("[data-testid='sel-folder-path']")?.textContent).toContain("full path not captured");
    expect(el.querySelector("[data-testid='sel-folder-path']")?.querySelector("input, button")).toBeNull();
    // the removed chrome is absent, and the folder's name is never the button
    expect(el.querySelector("[data-testid='sel-root']")).toBeNull();
    expect(el.querySelector("[data-testid='sel-watcher']")).toBeNull();
    expect(el.textContent).not.toContain("Watcher");
    expect(el.textContent).not.toContain("Use copied path");
    await act(async () => { root.unmount(); });
  });
});

/** Lets detached promise chains (scan/persist) run to completion. */
function settle(): Promise<void> {
  return act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
