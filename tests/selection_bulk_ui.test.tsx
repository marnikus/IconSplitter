// selection_bulk_ui.test.tsx — RULE 8: DOM-level coverage for navigation,
// paired thumbnails, multi-select (incl. indeterminate), bulk decisions and
// the All-decisions filter contract.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import SelectionPanel from "../src/selection/SelectionPanel";
import { FakeDir, FakeFile } from "./helpers/fakefs";

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeRoot(): FakeDir {
  const root = new FakeDir("root");
  const camp = new FakeDir("camp");
  for (const b of ["aa", "bb"]) {
    camp.children.set(`${b}.png`, new FakeFile(`${b}.png`, 5, 111, b));
    camp.children.set(`${b}_AI.png`, new FakeFile(`${b}_AI.png`, 9, 222, b));
  }
  root.children.set("camp", camp);
  return root;
}

function settle(): Promise<void> {
  return act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const key = (k: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

function changeSelect(el: Element, testid: string, value: string): Promise<void> {
  const sel = el.querySelector(`[data-testid='${testid}']`) as HTMLSelectElement;
  sel.value = value;
  return act(async () => { sel.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("Selection navigation, selection and bulk in a DOM", () => {
  beforeAll(() => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(fakeRoot());
  });

  it("navigates reviewed rows, shows paired thumbs, bulk-decides and filters all statuses", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root: Root = createRoot(el);
    await act(async () => { root.render(<SelectionPanel />); });
    await act(async () => { (el.querySelector("[data-testid='sel-root']") as HTMLButtonElement).click(); });
    await settle();

    // paired thumbnails on every row (O + A)
    expect(el.querySelectorAll("[data-testid^='sel-thumb-src-']").length).toBe(2);
    expect(el.querySelectorAll("[data-testid^='sel-thumb-ai-']").length).toBe(2);

    // approve active (aa), auto-advance to bb, then W back onto the reviewed row
    await key("a");
    await settle();
    await key("w");
    await settle();
    expect(el.querySelector("[data-testid='sel-status']")?.textContent).toContain("Approved");

    // change a previous decision: approved -> declined
    await key("d");
    await settle();
    expect(el.querySelector("[data-testid='sel-status']")?.textContent).toContain("Declined");

    // multi-select: one checkbox -> indeterminate header; select-all -> checked
    const checkA = el.querySelector("[data-testid^='sel-check-pair_']") as HTMLInputElement;
    await act(async () => { checkA.click(); });
    const head = el.querySelector("[data-testid='sel-check-all']") as HTMLInputElement;
    expect(head.indeterminate).toBe(true);
    const selAll = el.querySelector("[data-testid='sel-select-all']") as HTMLButtonElement;
    await act(async () => { selAll.click(); });
    expect(el.querySelector("[data-testid='sel-selcount']")?.textContent).toContain("2 selected");
    const head2 = el.querySelector("[data-testid='sel-check-all']") as HTMLInputElement;
    expect(head2.indeterminate).toBe(false);

    // bulk approve both (replaces the declined decision)
    const approveBtn = el.querySelector("[data-testid='sel-bulk-approve']") as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(false);
    expect(approveBtn.textContent).toContain("(2)");
    await act(async () => { approveBtn.click(); });
    await settle();
    expect(el.querySelector("[data-testid='sel-toast']")?.textContent).toContain("Approved 2 pairs");
    expect(el.querySelector("[data-testid='sel-count-approved']")?.textContent).toContain("2");

    // bulk buttons disable with empty selection
    const selAll2 = el.querySelector("[data-testid='sel-select-all']") as HTMLButtonElement;
    await act(async () => { selAll2.click(); });
    const bulkDec = el.querySelector("[data-testid='sel-bulk-decline']") as HTMLButtonElement;
    expect(bulkDec.disabled).toBe(true);

    // All decisions shows approved + (none pending now); singles stay single
    await changeSelect(el, "sel-status", "all");
    expect(el.querySelectorAll("[data-testid^='sel-row-']").length).toBe(2);
    await changeSelect(el, "sel-status", "approved");
    expect(el.querySelectorAll("[data-testid^='sel-row-']").length).toBe(2);
    await changeSelect(el, "sel-status", "pending");
    expect(el.querySelectorAll("[data-testid^='sel-row-']").length).toBe(0);
    expect(el.querySelector("[data-testid='sel-clear-empty']")).toBeTruthy();

    await act(async () => { root.unmount(); });
  });
});
