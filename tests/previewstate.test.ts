// previewstate.test.ts — TDD for the per-row preview state store (design D6).
// It exists so a 1000-row session re-renders the row that changed and not the
// list: subscribers are per row, unknown rows read as pending, and clear() tells
// every row it has something new to show (RULE 24).

import { describe, expect, it, vi } from "vitest";
import { createRowStates, PENDING } from "../src/lib/previewstate";

describe("previewstate — one row's state, one row's re-render", () => {
  it("reads a row nobody has set as pending, never as undefined", () => {
    const states = createRowStates();
    expect(states.get("a.png")).toBe(PENDING);
    expect(states.get("a.png").state).toBe("pending");
  });

  it("keeps each row's state apart", () => {
    const states = createRowStates();
    states.set("a.png", { ...PENDING, state: "ready", count: 3, icons: 3, urls: ["blob:1"], message: "3 icons" });
    expect(states.get("a.png").count).toBe(3);
    expect(states.get("b.png").state).toBe("pending");
  });

  it("notifies only the row that changed", () => {
    const states = createRowStates();
    const a = vi.fn();
    const b = vi.fn();
    states.subscribe("a.png", a);
    states.subscribe("b.png", b);
    states.set("a.png", { ...PENDING, state: "reading" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("stops notifying a row whose subscription was dropped", () => {
    const states = createRowStates();
    const a = vi.fn();
    const off = states.subscribe("a.png", a);
    off();
    states.set("a.png", { ...PENDING, state: "empty" });
    expect(a).not.toHaveBeenCalled();
  });

  it("clear() resets every row that had something to say and forgets the rest", () => {
    const states = createRowStates();
    const a = vi.fn();
    states.subscribe("a.png", a);
    states.set("a.png", { ...PENDING, state: "ready", count: 9, icons: 9 });
    states.clear();
    expect(a).toHaveBeenCalledTimes(2); // the set and the clear both speak to the row
    expect(states.get("a.png")).toBe(PENDING);
    expect(states.get("never-touched.png")).toBe(PENDING);
  });
});
