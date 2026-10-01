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
    const pick = el.querySelector("[data-testid='sel-root']") as HTMLButtonElement;
    expect(pick).toBeTruthy();
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
});

/** Lets detached promise chains (scan/persist) run to completion. */
function settle(): Promise<void> {
  return act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
