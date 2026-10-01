// selection_undo_ui.test.tsx — RULE 8: DOM-level coverage of the global
// undo/redo timeline (sel-undo/sel-redo buttons, Ctrl+Z / Ctrl+Shift+Z /
// Ctrl+Y hotkeys) and reset-to-pending (sel-reset, sel-bulk-reset).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const key = (k: string, mods: { ctrl?: boolean; shift?: boolean } = {}) => act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key: k, bubbles: true, ctrlKey: mods.ctrl, shiftKey: mods.shift,
  }));
});

const btn = (el: HTMLElement, id: string) => el.querySelector(`[data-testid='${id}']`) as HTMLButtonElement;
const click = (b: HTMLElement) => act(async () => { b.click(); });
const count = (el: HTMLElement, label: string) => el.querySelector(`[data-testid='sel-count-${label}']`)?.textContent ?? "";

async function mountPicked(): Promise<{ el: HTMLElement; root: Root }> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<SelectionPanel />); });
  await act(async () => { btn(el, "sel-root").click(); });
  await settle();
  return { el, root };
}

describe("Global undo/redo + reset-to-pending in a DOM", () => {
  beforeAll(() => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(fakeRoot());
  });
  beforeEach(() => localStorage.clear());

  it("undo/redo buttons walk a decision back and forth", async () => {
    const { el, root } = await mountPicked();
    expect(btn(el, "sel-undo").disabled).toBe(true);
    expect(btn(el, "sel-redo").disabled).toBe(true);

    await key("a"); // approve the active pair (aa)
    await settle();
    expect(count(el, "approved")).toContain("1");

    await click(btn(el, "sel-undo"));
    await settle();
    expect(count(el, "approved")).toContain("0");
    expect(btn(el, "sel-undo").disabled).toBe(true); // back at the empty frontier
    expect(btn(el, "sel-redo").disabled).toBe(false);

    await click(btn(el, "sel-redo"));
    await settle();
    expect(count(el, "approved")).toContain("1");
    expect(btn(el, "sel-redo").disabled).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it("ctrl+z and ctrl+shift+z drive the same timeline", async () => {
    const { el, root } = await mountPicked();
    await key("a");
    await settle();
    expect(count(el, "approved")).toContain("1");
    await key("z", { ctrl: true });
    await settle();
    expect(count(el, "approved")).toContain("0");
    await key("z", { ctrl: true, shift: true });
    await settle();
    expect(count(el, "approved")).toContain("1");
    await key("y", { ctrl: true }); // nothing left to redo — stays put
    await settle();
    expect(count(el, "approved")).toContain("1");
    await act(async () => { root.unmount(); });
  });

  it("sel-reset returns a reviewed pair to pending, and the reset is undoable", async () => {
    const { el, root } = await mountPicked();
    expect(el.querySelector("[data-testid='sel-reset']")).toBeNull(); // hidden while pending
    await key("a"); // approve aa, auto-advance to bb
    await settle();
    await key("w"); // step back onto the reviewed aa
    await settle();
    expect(el.querySelector("[data-testid='sel-status']")?.textContent).toContain("Approved");
    await click(btn(el, "sel-reset"));
    await settle();
    expect(el.querySelector("[data-testid='sel-reset']")).toBeNull();
    expect(count(el, "approved")).toContain("0");
    await click(btn(el, "sel-undo")); // the reset itself sits on the timeline
    await settle();
    expect(count(el, "approved")).toContain("1");
    await act(async () => { root.unmount(); });
  });

  it("sel-bulk-reset clears the selected visible pairs (fully undoable)", async () => {
    const { el, root } = await mountPicked();
    await key("a");
    await settle();
    await key("a"); // approve aa and bb
    await settle();
    expect(count(el, "approved")).toContain("2");
    await click(el.querySelector("[data-testid='sel-check-all']") as HTMLElement); // select all visible
    await settle();
    await click(btn(el, "sel-bulk-reset"));
    await settle();
    expect(el.querySelector("[data-testid='sel-toast']")?.textContent).toContain("Reset 2 pairs to pending");
    expect(count(el, "approved")).toContain("0");
    await click(btn(el, "sel-undo")); // step 1 reverts the select-all entry itself
    await settle();
    expect(count(el, "approved")).toContain("0");
    await click(btn(el, "sel-undo")); // step 2 restores both decisions
    await settle();
    expect(count(el, "approved")).toContain("2");
    await act(async () => { root.unmount(); });
  });
});
