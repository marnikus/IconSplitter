// selection_list_ui.test.tsx — RULE 8: DOM-level coverage of the List review
// workflow: view-mode switching, thumbnail zoom slider (bounds + persistence),
// multi-selection (single/all/none/indeterminate), bulk approve with affected
// counts, honest bulk-save failure, and active-row A/D hotkeys (a11y §11).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import SelectionPanel from "../src/selection/SelectionPanel";
import { pairId } from "../src/lib/pairing";
import { THUMB_MAX, THUMB_MIN, THUMB_STORE_KEY } from "../src/lib/reviewthumb";
import { FakeDir, FakeFile } from "./helpers/fakefs";

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FlakyDir extends FakeDir {
  failWrites = false;
  override async getFileHandle(n: string, opts?: { create?: boolean }): Promise<FakeFile> {
    if (this.failWrites && n.startsWith("review-decisions")) {
      throw new DOMException("read-only", "NotAllowedError");
    }
    return super.getFileHandle(n, opts);
  }
}

/** camp/a (paired) · sea/b (paired) · bare/c (AI result missing). */
function tree(): FlakyDir {
  const root = new FlakyDir("test_processing");
  const camp = new FakeDir("camp");
  camp.children.set("a.png", new FakeFile("a.png", 5, 111));
  camp.children.set("a_AI.png", new FakeFile("a_AI.png", 9, 222));
  const sea = new FakeDir("sea");
  sea.children.set("b.png", new FakeFile("b.png", 7, 333));
  sea.children.set("b_AI.png", new FakeFile("b_AI.png", 11, 444));
  const bare = new FakeDir("bare");
  bare.children.set("c.png", new FakeFile("c.png", 13, 555));
  root.children.set("camp", camp);
  root.children.set("sea", sea);
  root.children.set("bare", bare);
  return root;
}

const ID_A = pairId("camp", "a", "");
const ID_B = pairId("sea", "b", "");
const ID_C = pairId("bare", "c", "");

interface Mounted {
  el: HTMLElement;
  close: () => Promise<void>;
}

async function mountWith(root: FlakyDir): Promise<Mounted> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r: Root = createRoot(el);
  await act(async () => { r.render(<SelectionPanel />); });
  await click(el, "[data-testid='sel-root']");
  return {
    el,
    close: async () => {
      await act(async () => { r.unmount(); });
      el.remove();
    },
  };
}

async function click(el: HTMLElement, sel: string): Promise<void> {
  const target = el.querySelector(sel) as HTMLElement | null;
  expect(target, `missing ${sel}`).toBeTruthy();
  await act(async () => { target!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function setInput(el: HTMLElement, sel: string, value: string): Promise<void> {
  const input = el.querySelector(sel) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function press(key: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  await settle();
}

function settle(): Promise<void> {
  return act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => { window.localStorage.clear(); });

describe("view-mode switching", () => {
  it("Comparison shows the compare panel; List review is full-width without it", async () => {
    const m = await mountWith(tree());
    expect(m.el.querySelector("[data-testid='sel-compare']")).toBeTruthy();
    await click(m.el, "[data-testid='sel-view-list']");
    expect(m.el.querySelector("[data-testid='sel-compare']")).toBeNull(); // no large panel
    expect(m.el.querySelectorAll("[data-testid^='sel-row-main-']").length).toBe(3);
    await click(m.el, "[data-testid='sel-view-compare']");
    expect(m.el.querySelector("[data-testid='sel-compare']")).toBeTruthy();
    await m.close();
  });

  it("both layouts share the same decision state", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    await click(m.el, `[data-testid='sel-row-approve-${ID_A}']`);
    await click(m.el, "[data-testid='sel-view-compare']");
    const row = m.el.querySelector(`[data-testid='sel-row-${ID_A}']`);
    expect(row?.textContent).toContain("Approved");
    await m.close();
  });
});

describe("thumbnail zoom slider", () => {
  it("reports min/max/current, resizes live and carries an accessible label", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    const slider = m.el.querySelector("[data-testid='sel-thumbzoom']") as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.getAttribute("aria-label")).toBe("Thumbnail maximum height");
    expect(Number(slider.min)).toBe(THUMB_MIN);
    expect(Number(slider.max)).toBe(THUMB_MAX);
    expect(Number(slider.value)).toBe(128);
    expect(m.el.querySelector("[data-testid='sel-thumbzoom-value']")?.textContent).toBe("128 px");
    await setInput(m.el, "[data-testid='sel-thumbzoom']", "200");
    expect(m.el.querySelector("[data-testid='sel-thumbzoom-value']")?.textContent).toBe("200 px");
    const img = m.el.querySelector(`[data-testid='sel-row-main-${ID_A}'] img`) as HTMLElement;
    expect(img.style.height).toBe("200px"); // live resize while dragging
    await m.close();
  });

  it("persists the height after restart", async () => {
    const first = await mountWith(tree());
    await click(first.el, "[data-testid='sel-view-list']");
    await setInput(first.el, "[data-testid='sel-thumbzoom']", "72");
    await first.close();
    expect(window.localStorage.getItem(THUMB_STORE_KEY)).toBe("72");
    const second = await mountWith(tree());
    const slider = second.el.querySelector("[data-testid='sel-thumbzoom']") as HTMLInputElement;
    expect(slider.value).toBe("72");
    await second.close();
  });
});

describe("multi-selection", () => {
  it("checks rows one by one, selects all visible, deselects all, tri-state header", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    expect(m.el.querySelector("[data-testid='sel-selected-count']")?.textContent).toContain("0");
    await click(m.el, `[data-testid='sel-check-${ID_A}']`);
    expect(m.el.querySelector("[data-testid='sel-selected-count']")?.textContent).toContain("1");
    const header = m.el.querySelector("[data-testid='sel-select-all-check']") as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    await click(m.el, "[data-testid='sel-select-all']");
    expect(header.checked).toBe(true);
    expect(m.el.querySelector("[data-testid='sel-selected-count']")?.textContent).toContain("3");
    await click(m.el, "[data-testid='sel-deselect-all']");
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(false);
    expect(m.el.querySelector("[data-testid='sel-selected-count']")?.textContent).toContain("0");
    await m.close();
  });

  it("keeps selection across filters and never acts on hidden rows", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    await click(m.el, `[data-testid='sel-check-${ID_A}']`);
    await click(m.el, `[data-testid='sel-check-${ID_C}']`);
    await setInput(m.el, "[data-testid='sel-search']", "camp"); // hides bare/c
    await click(m.el, "[data-testid='sel-approve-selected']");
    const dialog = m.el.querySelector("[data-testid='sel-bulk-confirm']");
    expect(dialog?.textContent).toContain("hidden by filters");
    expect(dialog?.textContent).toContain("1 pair"); // affected count before confirmation
    await click(m.el, "[data-testid='sel-bulk-apply']");
    await setInput(m.el, "[data-testid='sel-search']", "");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_A}']`)?.textContent).toContain("Approved");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_C}']`)?.textContent).toContain("Pending"); // hidden row untouched
    await m.close();
  });
});

describe("bulk review actions", () => {
  it("approve selected confirms with counts and applies in one operation", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    await click(m.el, `[data-testid='sel-check-${ID_C}']`); // pair with no AI result
    await click(m.el, "[data-testid='sel-approve-selected']");
    const dialog = m.el.querySelector("[data-testid='sel-bulk-confirm']");
    expect(dialog?.textContent).toContain("1 pair"); // affected count before confirmation
    expect(dialog?.textContent).toContain("missing"); // missing pairs never approved silently
    await click(m.el, "[data-testid='sel-bulk-apply']");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_C}']`)?.textContent).toContain("Approved");
    expect(m.el.querySelector("[data-testid='sel-count-approved']")?.textContent).toContain("1");
    expect(m.el.querySelectorAll("[data-testid='sel-toast']").length).toBe(1); // one report, not per image
    await m.close();
  });

  it("approve visible list affects every visible row and disables when empty", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    const btn = m.el.querySelector("[data-testid='sel-approve-visible']") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    await click(m.el, "[data-testid='sel-approve-visible']");
    expect(m.el.querySelector("[data-testid='sel-bulk-confirm']")?.textContent).toContain("3");
    await click(m.el, "[data-testid='sel-bulk-apply']");
    expect(m.el.querySelector("[data-testid='sel-count-approved']")?.textContent).toContain("3");
    await setInput(m.el, "[data-testid='sel-search']", "zzz-none");
    const emptyBtn = m.el.querySelector("[data-testid='sel-approve-visible']") as HTMLButtonElement;
    expect(emptyBtn.disabled).toBe(true); // nothing eligible
    await m.close();
  });

  it("bulk-save failure reports affected/unaffected counts and keeps memory", async () => {
    const root = tree();
    const m = await mountWith(root);
    await click(m.el, "[data-testid='sel-view-list']");
    root.failWrites = true;
    await click(m.el, "[data-testid='sel-approve-visible']");
    await click(m.el, "[data-testid='sel-bulk-apply']");
    const toast = m.el.querySelector("[data-testid='sel-toast']");
    expect(toast?.textContent).toContain("0 of 3 saved");
    expect(toast?.textContent).toContain("memory");
    expect(m.el.querySelector("[data-testid='sel-writewarn']")).toBeTruthy();
    // decisions are still applied in memory — rows update immediately
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_A}']`)?.textContent).toContain("Approved");
    await m.close();
  });
});

describe("active-row review", () => {
  it("A/D act on the active row, arrows move it, next-pending auto-advances", async () => {
    const m = await mountWith(tree());
    await click(m.el, "[data-testid='sel-view-list']");
    // default sort newest first: visible [c, b, a]; scan leaves the first pair active
    expect(m.el.querySelector(`[data-testid='sel-row-main-${ID_A}']`)?.getAttribute("aria-current")).toBe("true");
    await click(m.el, "[data-testid='sel-autonext']"); // off: arrows drive the row
    await click(m.el, `[data-testid='sel-row-main-${ID_C}']`); // click makes it active
    await press("d");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_C}']`)?.textContent).toContain("Declined");
    expect(m.el.querySelector(`[data-testid='sel-row-main-${ID_C}']`)?.getAttribute("aria-current")).toBe("true");
    await press("ArrowDown");
    expect(m.el.querySelector(`[data-testid='sel-row-main-${ID_B}']`)?.getAttribute("aria-current")).toBe("true");
    await press("a");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_B}']`)?.textContent).toContain("Approved");
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_A}']`)?.textContent).toContain("Pending"); // untouched
    await click(m.el, "[data-testid='sel-autonext']"); // on: decisions roll to the next pending
    await press("d"); // changes B's decision and advances to A (the last pending)
    expect(m.el.querySelector(`[data-testid='sel-row-${ID_B}']`)?.textContent).toContain("Declined");
    expect(m.el.querySelector(`[data-testid='sel-row-main-${ID_A}']`)?.getAttribute("aria-current")).toBe("true");
    await m.close();
  });
});
