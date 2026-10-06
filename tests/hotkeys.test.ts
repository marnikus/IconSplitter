// hotkeys.test.ts — RULE 8: the review hotkey mapping drives the review, and
// only the review. Shared by both Selection surfaces, so it is tested once.
import { describe, expect, it } from "vitest";
import { hotTarget, isTextField, runHotAction, type HotTarget } from "../src/selection/hotkeys";

interface Stub extends HotTarget {
  log: string[];
}

function stub(selectedId: string | null = "a"): Stub {
  const log: string[] = [];
  return {
    selectedId,
    visible: [{ pairId: "a" }, { pairId: "b" }, { pairId: "c" }],
    zoom: "fit",
    log,
    decide: (id, d) => { log.push(`decide:${id}:${d}`); },
    select: (id) => { log.push(`select:${id}`); },
    patch: (p) => { log.push(`patch:${p.zoom}`); },
  };
}

describe("runHotAction", () => {
  it("A approves and D declines the active row", () => {
    const t = stub();
    runHotAction("approve", t);
    runHotAction("decline", t);
    expect(t.log).toEqual(["decide:a:approved", "decide:a:declined"]);
  });

  it("arrow actions move the active row one step each way", () => {
    const t = stub("b");
    runHotAction("next", t);
    runHotAction("prev", t);
    expect(t.log).toEqual(["select:c", "select:a"]);
  });

  it("does not wrap past either end of the visible list", () => {
    const first = stub("a");
    runHotAction("prev", first);
    expect(first.log).toEqual([]);
    const last = stub("c");
    runHotAction("next", last);
    expect(last.log).toEqual([]);
  });

  it("Space toggles the comparison zoom both ways", () => {
    const fit = stub();
    runHotAction("zoom", fit);
    expect(fit.log).toEqual(["patch:full"]);
    const full = { ...stub(), zoom: "full" as const };
    runHotAction("zoom", full);
    expect(full.log).toEqual(["patch:fit"]);
  });

  it("never invents a decision when no row is active (RULE 4)", () => {
    const t = stub(null);
    runHotAction("approve", t);
    runHotAction("decline", t);
    expect(t.log).toEqual([]);
  });
});

describe("hotTarget", () => {
  it("narrows the hook API to exactly what a hotkey may touch", () => {
    const decided: string[] = [];
    const target = hotTarget({
      s: { selectedId: "p1", zoom: "full" },
      visible: [{ pairId: "p1" }],
      decide: (id) => { decided.push(id); },
      select: () => undefined,
      patch: () => undefined,
    });
    expect(target).toMatchObject({ selectedId: "p1", zoom: "full" });
    expect(target.visible.map((v) => v.pairId)).toEqual(["p1"]);
    target.decide("p1", "approved");
    expect(decided).toEqual(["p1"]);
  });
});

describe("isTextField", () => {
  it("swallows keystrokes typed into inputs, selects and textareas", () => {
    expect(isTextField(document.createElement("input"))).toBe(true);
    expect(isTextField(document.createElement("select"))).toBe(true);
    expect(isTextField(document.createElement("textarea"))).toBe(true);
  });

  it("lets keystrokes through everywhere else", () => {
    expect(isTextField(document.createElement("button"))).toBe(false);
    expect(isTextField(document.body)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });

  it("does not treat a control that merely holds focus as a text field", () => {
    // the zoom slider and the row checkboxes keep focus after use; Ctrl+Z there
    // must still undo, or undo looks broken right after those two controls
    for (const type of ["range", "checkbox", "radio", "button", "submit", "file", "color"]) {
      const el = document.createElement("input");
      el.type = type;
      expect(isTextField(el)).toBe(false);
    }
  });

  it("still swallows keys in every text-entry surface", () => {
    for (const type of ["text", "search", "number", "email", "password", "url", "tel", "date", "month"]) {
      const el = document.createElement("input");
      el.type = type;
      expect(isTextField(el)).toBe(true);
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isTextField(editable)).toBe(true);
  });
});
