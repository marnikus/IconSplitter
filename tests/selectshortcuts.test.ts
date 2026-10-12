// selectshortcuts.test.ts — Q/E active-row only reusable across tabs, focus and modifier aware

import { describe, expect, it, vi } from "vitest";
import { handleSelectShortcut } from "../src/lib/selectshortcuts";

function makeEvent(key: string, target: EventTarget | null = null, ctrl = false, meta = false, alt = false): KeyboardEvent {
  return { key, target, ctrlKey: ctrl, metaKey: meta, altKey: alt } as unknown as KeyboardEvent;
}

describe("selectshortcuts reusable Q/E active-only", () => {
  it("E selects only active row when activeId present", () => {
    const selActive = vi.fn();
    const deselActive = vi.fn();
    const selVisible = vi.fn();
    const deselAll = vi.fn();
    const handled = handleSelectShortcut(makeEvent("e"), {
      activeId: "a.png",
      selectActive: selActive,
      deselectActive: deselActive,
      selectVisible: selVisible,
      deselectAll: deselAll,
    });
    expect(handled).toBe(true);
    expect(selActive).toHaveBeenCalled();
    expect(selVisible).not.toHaveBeenCalled();
    expect(deselActive).not.toHaveBeenCalled();
    expect(deselAll).not.toHaveBeenCalled();
  });

  it("Q deselects only active row when activeId present", () => {
    const selActive = vi.fn();
    const deselActive = vi.fn();
    const selVisible = vi.fn();
    const deselAll = vi.fn();
    const handled = handleSelectShortcut(makeEvent("q"), {
      activeId: "b.png",
      selectActive: selActive,
      deselectActive: deselActive,
      selectVisible: selVisible,
      deselectAll: deselAll,
    });
    expect(handled).toBe(true);
    expect(deselActive).toHaveBeenCalled();
    expect(deselAll).not.toHaveBeenCalled();
    expect(selActive).not.toHaveBeenCalled();
  });

  it("E fallback to selectVisible when no activeId", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const handled = handleSelectShortcut(makeEvent("e"), { selectVisible: sel, deselectAll: desel });
    expect(handled).toBe(true);
    expect(sel).toHaveBeenCalled();
  });

  it("Q fallback to deselectAll when no activeId", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const handled = handleSelectShortcut(makeEvent("q"), { selectVisible: sel, deselectAll: desel });
    expect(handled).toBe(true);
    expect(desel).toHaveBeenCalled();
  });

  it("uppercase Q/E also work", () => {
    const selActive = vi.fn();
    const deselActive = vi.fn();
    expect(handleSelectShortcut(makeEvent("E"), { activeId: "x", selectActive: selActive, deselectActive: deselActive })).toBe(true);
    expect(selActive).toHaveBeenCalled();
    expect(handleSelectShortcut(makeEvent("Q"), { activeId: "x", selectActive: selActive, deselectActive: deselActive })).toBe(true);
    expect(deselActive).toHaveBeenCalled();
  });

  it("ignores Ctrl/Meta/Alt", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("e", null, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(handleSelectShortcut(makeEvent("q", null, false, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(handleSelectShortcut(makeEvent("e", null, false, false, true), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(sel).not.toHaveBeenCalled();
  });

  it("ignores text fields", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    const input = document.createElement("input");
    input.type = "text";
    expect(handleSelectShortcut(makeEvent("e", input), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(sel).not.toHaveBeenCalled();
  });

  it("A/D not handled here (approve/decline elsewhere)", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("a"), { selectVisible: sel, deselectAll: desel })).toBe(false);
    expect(handleSelectShortcut(makeEvent("d"), { selectVisible: sel, deselectAll: desel })).toBe(false);
  });

  it("other keys not handled", () => {
    const sel = vi.fn();
    const desel = vi.fn();
    expect(handleSelectShortcut(makeEvent("b"), { selectVisible: sel, deselectAll: desel })).toBe(false);
  });
});
