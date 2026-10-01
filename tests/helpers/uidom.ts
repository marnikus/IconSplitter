// uidom.ts — shared DOM helpers for the panel-level UI suites (RULE 8): mount
// a real component into happy-dom, drive real events, and let detached promise
// chains (scan/write) settle. Kept in tests/helpers so new suites never copy
// the same event plumbing again.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

export interface Mounted {
  el: HTMLElement;
  ui: Root;
}

const live: Mounted[] = [];

export async function mountPanel(node: React.ReactElement): Promise<Mounted> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = createRoot(el);
  await act(async () => { ui.render(node); });
  await settle();
  const mounted = { el, ui };
  live.push(mounted);
  return mounted;
}

/** Unmounts everything this test file mounted: window-level listeners must not leak. */
export async function unmountAll(): Promise<void> {
  for (const m of live.splice(0)) {
    await act(async () => { m.ui.unmount(); });
    m.el.remove();
  }
  await settle();
}

/** Mounts a review surface and picks the given fake root through its button. */
export async function mountWithRoot(
  node: React.ReactElement, root: unknown, rootTestid = "v2-root",
): Promise<Mounted> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  const mounted = await mountPanel(node);
  await click(mounted.el.querySelector(`[data-testid='${rootTestid}']`) as HTMLElement);
  return mounted;
}

export function q(el: ParentNode, sel: string): HTMLElement | null {
  return el.querySelector(sel) as HTMLElement | null;
}

export function text(el: ParentNode, sel: string): string {
  return q(el, sel)?.textContent ?? "";
}

export async function click(node: HTMLElement | null): Promise<void> {
  if (!node) throw new Error("click: node missing");
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

export async function key(k: string, mod = false, shift = false): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: mod, metaKey: mod, shiftKey: shift, bubbles: true }));
  });
  await settle();
}

/** React fires a checkbox onChange from the click event, so click it for real. */
export async function check(box: HTMLInputElement | null, on: boolean): Promise<void> {
  if (!box) throw new Error("check: node missing");
  await act(async () => {
    if (box.checked !== on) box.click();
  });
  await settle();
}

export async function choose(el: ParentNode, sel: string, value: string): Promise<void> {
  const node = q(el, sel) as HTMLSelectElement | null;
  if (!node) throw new Error(`choose: ${sel} missing`);
  await act(async () => {
    nativeValue(node, value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

export async function slide(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    nativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** React tracks input values, so the native setter must be used to change one. */
export function nativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

export async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

export function dropDb(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("iconSplitter");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
