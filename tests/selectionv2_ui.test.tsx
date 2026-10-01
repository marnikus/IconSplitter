// selectionv2_ui.test.tsx — RULE 8: DOM-level tests for the V2 Selection
// surface (spec V2 §16). Everything here drives the real panel: folder pick →
// recursive scan → list review rows → zoom → selection → bulk approve →
// persistence, against in-memory FS fakes. No component logic is re-implemented.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { DECISIONS_FILE, TMP_FILE } from "../src/selection/reviewstore";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { PREFS_KEY } from "../src/selectionv2/prefsstore";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
const HARBOR = pairId("coastal", "harbor", "");
const DUNES = pairId("coastal", "dunes", ""); // original without an AI result

/** split_root/architecture/{fog,court} + coastal/{harbor, dunes(unpaired)}. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  coast.children.set("dunes.png", new FakeFile("dunes.png", 12, 500, "g"));
  root.children.set("coastal", coast);
  return root;
}

describe("Selection V2 panel", () => {
  beforeEach(async () => {
    localStorage.clear();
    await dropDb();
  });

  it("scans recursively, pairs both sides and lists one row per pair", async () => {
    const { el } = await mount(makeRoot());
    expect(rows(el).length).toBe(4);
    expect(text(el, `[data-testid='v2-row-${FOG}']`)).toContain("fog_AI.png");
    expect(text(el, `[data-testid='v2-row-${FOG}']`)).toContain("architecture");
    // every row carries BOTH labelled thumbnails (spec V2 §3)
    for (const id of [FOG, COURT, HARBOR, DUNES]) {
      expect(q(el, `[data-testid='v2-row-${id}'] [data-testid='v2-thumb-src']`)?.textContent).toContain("Original");
      expect(q(el, `[data-testid='v2-row-${id}'] [data-testid='v2-thumb-ai']`)?.textContent).toContain("AI result");
    }
    // the unpaired original keeps its row with a labelled placeholder (RULE 4)
    expect(q(el, `[data-testid='v2-row-${DUNES}'] [data-testid='v2-thumb-ai'] [role='img']`)
      ?.getAttribute("aria-label")).toBe("AI result missing");
    expect(text(el, "[data-testid='v2-count-total']")).toContain("4");
  });

  it("shows the unpaired original as a missing AI result, never silently", async () => {
    const { el } = await mount(makeRoot());
    expect(text(el, `[data-testid='v2-status-${DUNES}']`)).toContain("AI result missing");
    expect(text(el, "[data-testid='v2-count-attention']")).toContain("1");
    expect((q(el, `[data-testid='v2-open-ai-${DUNES}']`) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loads both sides of a pair as real object-URL thumbnails", async () => {
    const { el } = await mount(makeRoot());
    const row = q(el, `[data-testid='v2-row-${FOG}']`)!;
    const src = q(row, "[data-testid='v2-thumb-src']")?.firstElementChild as HTMLImageElement;
    const ai = q(row, "[data-testid='v2-thumb-ai']")?.firstElementChild as HTMLImageElement;
    expect(src.tagName).toBe("IMG");
    expect(src.src.startsWith("blob:")).toBe(true);
    expect(ai.src).not.toBe(src.src); // one object URL per side, both cached per path
    expect(src.alt).toBe("Original thumbnail");
    expect(ai.alt).toBe("AI result thumbnail");
  });

  it("switches between list review and comparison, and the list has no compare panel", async () => {
    const { el } = await mount(makeRoot());
    expect(q(el, "[data-testid='v2-list']")).toBeTruthy();
    expect(q(el, "[data-testid='sel-compare']")).toBeNull();
    await click(q(el, "[data-testid='v2-mode-compare']")!);
    expect(q(el, "[data-testid='sel-compare']")).toBeTruthy();
    expect(q(el, "[data-testid='v2-list']")).toBeNull();
    await click(q(el, "[data-testid='v2-mode-list']")!);
    expect(q(el, "[data-testid='v2-list']")).toBeTruthy();
  });

  it("marks the clicked row active and decides it with A / D", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${HARBOR}']`)!);
    expect(q(el, `[data-testid='v2-row-${HARBOR}']`)?.getAttribute("aria-current")).toBe("true");
    await check(q(el, "[data-testid='v2-autonext']") as HTMLInputElement, false); // stay on this row
    await key("a");
    expect(text(el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✓ Approved");
    expect(q(el, `[data-testid='v2-row-${HARBOR}']`)?.getAttribute("aria-current")).toBe("true");
    await key("d");
    expect(text(el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✕ Declined");
    expect(text(el, "[data-testid='v2-count-declined']")).toContain("1");
  });

  it("advances to the next pending pair after a decision while auto-next is on", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    expect((q(el, "[data-testid='v2-autonext']") as HTMLInputElement).checked).toBe(true);
    await key("a");
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    expect(q(el, "[aria-current='true']")?.getAttribute("data-testid")).not.toBe(`v2-row-${FOG}`);
  });

  it("moves the active row with the arrow keys", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    await key("ArrowDown");
    const active = el.querySelector("[aria-current='true']");
    expect(active?.getAttribute("data-testid")).not.toBe(`v2-row-${FOG}`);
  });

  it("zoom slider exposes its bounds, live value, row height and persistence", async () => {
    const { el, ui } = await mount(makeRoot());
    const slider = q(el, "[data-testid='v2-thumb']") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["48", "240", "4", "84"]);
    expect(slider.getAttribute("aria-label")).toBe("Thumbnail maximum height");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("84 px");
    await slide(slider, "128");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("128 px");
    // row height + thumbnail height follow the slider immediately (never stretched)
    expect(q(el, "[data-testid='v2-list']")?.getAttribute("style")).toContain("--v2-thumb: 128px");
    const thumb = q(el, `[data-testid='v2-row-${FOG}'] [data-testid='v2-thumb-src']`)?.firstElementChild as HTMLElement;
    expect(thumb.style.height).toBe("128px");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).thumbHeight).toBe(128);
    await act(async () => { ui.unmount(); });
    const again = await mount(makeRoot());
    expect((q(again.el, "[data-testid='v2-thumb']") as HTMLInputElement).value).toBe("128");
    expect(text(again.el, "[data-testid='v2-thumb-value']")).toBe("128 px");
    await act(async () => { again.ui.unmount(); });
  });

  it("selects one, many, all visible and none again, with an indeterminate header", async () => {
    const { el } = await mount(makeRoot());
    const all = q(el, "[data-testid='v2-check-all']") as HTMLInputElement;
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("1 selected");
    expect(all.indeterminate).toBe(true);
    await click(q(el, "[data-testid='v2-select-visible']")!);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    await check(q(el, `[data-testid='v2-check-${COURT}']`) as HTMLInputElement, false);
    expect(all.indeterminate).toBe(true);
    await click(q(el, "[data-testid='v2-deselect']")!);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("0 selected");
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(false);
  });

  it("keeps selection across filter and sort changes, scoped to what is visible", async () => {
    const { el } = await mount(makeRoot());
    await selectByStatus(el, "approved"); // nothing approved yet -> no rows
    expect(rows(el).length).toBe(0);
    await selectByStatus(el, "all");
    await click(q(el, "[data-testid='v2-select-visible']")!); // 4 checked
    await selectByStatus(el, "declined"); // none declined -> 0 visible
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(text(el, "[data-testid='v2-hidden']")).toContain("4 checked but hidden");
    expect(text(el, "[data-testid='v2-scope']")).toBe("across 0 visible pairs");
    // sorting must not lose the checked rows or the active one
    await selectByStatus(el, "all");
    await choose(el, "[data-testid='v2-sort']", "name");
    await choose(el, "[data-testid='v2-dir']", "asc");
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(rows(el).length).toBe(4);
  });

  it("approves the checked rows in one operation with one summary toast", async () => {
    const { el } = await mount(makeRoot());
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    await check(q(el, `[data-testid='v2-check-${COURT}']`) as HTMLInputElement, true);
    const btn = q(el, "[data-testid='v2-approve-selected']") as HTMLButtonElement;
    expect(btn.textContent).toBe("✓ Approve selected (2)");
    await click(btn);
    expect(btn.textContent).toBe("Confirm approve 2?"); // count shown before it applies
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    expect(text(el, `[data-testid='v2-status-${COURT}']`)).toBe("✓ Approved");
    expect(text(el, "[data-testid='v2-toast']")).toBe("2 pairs approved");
    expect(text(el, "[data-testid='v2-count-approved']")).toContain("2");
  });

  it("approves the whole visible list", async () => {
    const { el } = await mount(makeRoot());
    const btn = q(el, "[data-testid='v2-approve-visible']") as HTMLButtonElement;
    expect(btn.textContent).toBe("✓ Approve visible list (4)");
    await click(btn);
    await click(q(el, "[data-testid='v2-approve-visible']")!);
    expect(text(el, "[data-testid='v2-toast']")).toBe("3 pairs approved · 1 skipped (incomplete or gone)");
    expect(text(el, `[data-testid='v2-status-${DUNES}']`)).toContain("AI result missing");
  });

  it("keeps incomplete pairs out of the bulk scope and disarms with Escape", async () => {
    const { el } = await mount(makeRoot());
    const btn = q(el, "[data-testid='v2-approve-selected']") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await check(q(el, `[data-testid='v2-check-${DUNES}']`) as HTMLInputElement, true);
    expect(text(el, "[data-testid='v2-blocked']")).toContain("1 checked pair incomplete");
    expect(btn.textContent).toBe("✓ Approve selected (0)");
    expect(btn.disabled).toBe(true); // an incomplete pair is never eligible
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    expect(btn.textContent).toBe("✓ Approve selected (1)");
    await click(btn);
    expect(btn.textContent).toBe("Confirm approve 1?"); // count shown before it applies
    await key("Escape");
    expect(btn.textContent).toBe("✓ Approve selected (1)");
  });

  it("keeps decisions in memory and reports a failed save honestly", async () => {
    const root = makeRoot();
    root.children.set(TMP_FILE, new BrokenFile(TMP_FILE)); // decision file cannot be written
    const { el } = await mount(root);
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved"); // kept in memory
    expect(text(el, "[data-testid='v2-toast']")).toBe("1 pair approved · save failed — retry");
    expect(q(el, "[data-testid='v2-writewarn']")).toBeTruthy();
    expect(text(el, "[data-testid='sel-retry-count']")).toContain("awaiting retry");
    root.children.delete(TMP_FILE); // the folder becomes writable again
    await click(q(el, "[data-testid='v2-retry']")!);
    expect(q(el, "[data-testid='v2-writewarn']")).toBeNull();
  });

  it("reports an empty folder and a filter with no matches distinctly", async () => {
    const empty = new FakeDir("empty_root");
    const { el } = await mount(empty);
    expect(q(el, "[data-testid='v2-empty']")).toBeTruthy();
    const full = await mount(makeRoot());
    await selectByStatus(full.el, "approved");
    expect(q(full.el, "[data-testid='v2-nomatch']")).toBeTruthy();
    await click(q(full.el, "[data-testid='v2-clear-empty']")!);
    expect(rows(full.el).length).toBe(4);
    await act(async () => { full.ui.unmount(); });
  });

  it("warns about a corrupt decision file without losing the review", async () => {
    const root = makeRoot();
    root.children.set(DECISIONS_FILE, new FakeFile(DECISIONS_FILE, 5, 1, "{oops"));
    const { el } = await mount(root);
    expect(q(el, "[data-testid='v2-corrupt']")).toBeTruthy();
    expect(rows(el).length).toBe(4);
  });

  it("rescan keeps decisions, adds new pairs pending and preserves the zoom", async () => {
    const root = makeRoot();
    const { el } = await mount(root);
    await slide(q(el, "[data-testid='v2-thumb']") as HTMLInputElement, "160");
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    await key("a");
    const coast = root.children.get("coastal") as FakeDir;
    coast.children.set("tide.png", new FakeFile("tide.png", 12, 900, "h"));
    coast.children.set("tide_AI.png", new FakeFile("tide_AI.png", 20, 950, "i"));
    (root.children.get("architecture") as FakeDir).children.delete("court.png");
    (root.children.get("architecture") as FakeDir).children.delete("court_AI.png");
    await click(q(el, "[data-testid='v2-rescan']")!);
    const tide = pairId("coastal", "tide", "");
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved"); // decision survived
    expect(text(el, `[data-testid='v2-status-${tide}']`)).toBe("◔ Pending"); // new pair starts pending
    expect(q(el, `[data-testid='v2-row-${COURT}']`)).toBeNull(); // removed pair is gone
    expect(text(el, "[data-testid='sel-diff']")).toContain("+1 new");
    expect(text(el, "[data-testid='sel-diff']")).toContain("1 removed");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("160 px"); // zoom preserved
  });

  it("restores decisions from the decision file on a fresh mount", async () => {
    const root = makeRoot();
    const first = await mount(root);
    await click(q(first.el, `[data-testid='v2-row-${HARBOR}']`)!);
    await key("a");
    await act(async () => { first.ui.unmount(); });
    const second = await mount(root);
    expect(text(second.el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✓ Approved");
    expect(text(second.el, "[data-testid='v2-count-approved']")).toContain("1");
    await act(async () => { second.ui.unmount(); });
  });

  it("labels the review controls for keyboard and screen-reader users", async () => {
    const { el } = await mount(makeRoot());
    expect((q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement).getAttribute("aria-label")).toBe("Select fog");
    expect(q(el, "[data-testid='v2-approve-visible']")?.getAttribute("aria-label")).toBe("Approve visible list — 4 pairs");
    expect(q(el, "[data-testid='v2-check-all']")?.getAttribute("aria-label")).toBe("Select all visible image pairs");
    expect(q(el, "[data-testid='v2-rows']")?.getAttribute("aria-label")).toBe("Image review pairs");
    expect(q(el, "[data-testid='v2-list'] kbd")?.textContent).toBe("A");
  });
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function mount(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = createRoot(el);
  await act(async () => { ui.render(<SelectionV2Panel />); });
  await click(q(el, "[data-testid='v2-root']")!);
  return { el, ui };
}

function q(el: HTMLElement, sel: string): HTMLElement | null {
  return el.querySelector(sel);
}

function rows(el: HTMLElement): Element[] {
  return [...el.querySelectorAll("[data-testid^='v2-row-']")];
}

function text(el: HTMLElement, sel: string): string {
  return q(el, sel)?.textContent ?? "";
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function key(k: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
  await settle();
}

/** React fires a checkbox onChange from the click event, so click it for real. */
async function check(box: HTMLInputElement, on: boolean): Promise<void> {
  await act(async () => {
    if (box.checked !== on) box.click();
  });
  await settle();
}

async function slide(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    nativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function choose(select: HTMLElement, sel: string, value: string): Promise<void> {
  const el = q(select, sel) as HTMLSelectElement;
  await act(async () => {
    nativeValue(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

const selectByStatus = (el: HTMLElement, v: string) => choose(el, "[data-testid='v2-status']", v);

/** React tracks input values, so the native setter must be used to change one. */
function nativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function dropDb(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("iconSplitter");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
