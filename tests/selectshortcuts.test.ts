// selectshortcuts.test.ts — A/E select/deselect all reusable across tabs, focus and modifier aware

import { describe, expect, it, vi } from "vitest";
import { handleSelectShortcut } from "../src/lib/selectshortcuts";

function makeEvent(key: string, target: EventTarget | null = null, ctrl = false, meta = false, alt = false): KeyboardEvent {
  return { key, target, ctrlKey: ctrl, metaKey: meta, altKey: alt } as unknown as KeyboardEvent;
}

describe("selectshortcuts reusable A/E", () => {
  it("A selects visible", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const handled = handleSelectShortcut(makeEvent("a"), { selectVisible: sel, deselectAll: desel });
    expect(handled).toBe(true);
    expect(sel).toHaveBeenCalled();
    expect(desel).not.toHaveBeenCalled();
  });

  it("E deselects all", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const handled = handleSelectShortcut(makeEvent("e"), { selectVisible: sel, deselectAll: desel });
    expect(handled).toBe(true);
    expect(desel).toHaveBeenCalled();
    expect(sel).not.toHaveBeenCalled();
  });

  it("uppercase A/E also work", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("A"), { selectVisible: sel, deselectAll: desel })).toBe(true);
    expect(sel).toHaveBeenCalled();
    expect(handleSelectShortcut(makeEvent("E"), { selectVisible: sel, deselectAll: desel })).toBe(true);
    expect(desel).toHaveBeenCalled();
  });

  it("ignores Ctrl/Meta/Alt", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("a", null, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(handleSelectShortcut(makeEvent("a", null, false, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(handleSelectShortcut(makeEvent("a", null, false, false, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(sel).not.toHaveBeenCalled();
  });

  it("ignores text fields", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const input = document.createElement("input");
    input.type = "text";
    expect(handleSelectShortcut(makeEvent("a", input), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(sel).not.toHaveBeenCalled();
  });

  it("other keys not handled", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("b"), { selectVisible: sel, deselectAll: desel })).toBe(false);
  });
});
