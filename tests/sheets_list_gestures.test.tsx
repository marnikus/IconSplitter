import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { click, mountWithSheets, q } from "./helpers/sheetsHarness";

let cleanup: (() => Promise<void>) | null = null;
beforeEach(() => { localStorage.clear(); });
afterEach(async () => { await cleanup?.(); cleanup = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const rows = (h: HTMLElement) => [...h.querySelectorAll('[data-testid^="sheet-row-"]')] as HTMLElement[];
const checks = (h: HTMLElement) => rows(h).map((r) => (r.querySelector('input[type="checkbox"]') as HTMLInputElement).checked);
const activeIdx = (h: HTMLElement) => rows(h).findIndex((r) => r.getAttribute("aria-selected") === "true");
const key = (h: HTMLElement, k: string) => act(async () => { q(h, "sheet-list")!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

it("new sheets start checked; header checkbox clears and restores all", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  expect(checks(m.host)).toEqual([true, true, true]);
  await click(q(m.host, "sheet-check-all"));
  expect(checks(m.host)).toEqual([false, false, false]);
  expect((q(m.host, "export-zip") as HTMLButtonElement).disabled).toBe(true);
  await click(q(m.host, "sheet-check-all"));
  expect(checks(m.host)).toEqual([true, true, true]);
});

it("plain click activates without checking; Ctrl toggles; Shift checks a range", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  await click(q(m.host, "sheet-check-all")); // none checked
  await click(rows(m.host)[0].querySelector("p"));
  expect(activeIdx(m.host)).toBe(0);
  expect(checks(m.host)).toEqual([false, false, false]);
  await click(rows(m.host)[1].querySelector("p"), { ctrlKey: true });
  expect(checks(m.host)).toEqual([false, true, false]);
  await click(rows(m.host)[2].querySelector("p"), { shiftKey: true });
  expect(checks(m.host)).toEqual([true, true, true]);
  expect(activeIdx(m.host)).toBe(2);
});

it("arrow keys move the active sheet; Q / E uncheck / check it", async () => {
  const m = await mountWithSheets(["a.png", "b.png"]); cleanup = m.unmount;
  expect(activeIdx(m.host)).toBe(1); // last imported is active
  await key(m.host, "ArrowUp");
  expect(activeIdx(m.host)).toBe(0);
  await key(m.host, "q");
  expect(checks(m.host)).toEqual([false, true]);
  await key(m.host, "e");
  expect(checks(m.host)).toEqual([true, true]);
});

it("removing the active sheet activates the last remaining one and drops its check", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  await click(m.host.querySelector('[data-testid^="sheet-remove-"]'));
  expect(rows(m.host)).toHaveLength(2);
  expect(q(m.host, "export-zip")!.textContent).toContain("(4)");
  await click(rows(m.host)[1].querySelector('[data-testid^="sheet-remove-"]'));
  expect(activeIdx(m.host)).toBe(0);
});
