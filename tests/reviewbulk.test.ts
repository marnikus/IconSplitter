// reviewbulk.test.ts — RULE 8: bulk review-action planning + honest reporting.
// Scope split, missing-pair visibility, one result message with counts.
import { describe, expect, it } from "vitest";
import { bulkResultText, bulkSummary, planBulk } from "../src/lib/reviewbulk";
import type { ViewPair } from "../src/lib/reviewfilter";

function pair(id: string, missing: "none" | "ai" | "src" = "none"): ViewPair {
  const mk = (p: string) => ({ relPath: p, size: 1, mtime: 1 });
  return {
    pairId: id, base: id, relDir: "a",
    source: missing === "src" ? null : mk(`a/${id}.png`),
    ai: missing === "ai" ? null : mk(`a/${id}_AI.png`),
    created: 1, generated: 2,
    decision: id.startsWith("ok") ? "approved" : "pending",
    reviewedAt: null,
  };
}

describe("planBulk", () => {
  it("selected scope touches checked ∩ visible only", () => {
    const plan = planBulk("selected", ["a", "x", "b"], ["a", "b", "c"]);
    expect(plan.ids).toEqual(["a", "b"]);
    expect(plan.hiddenSkipped).toBe(1); // x is hidden — never silently touched
  });

  it("visible scope touches every visible row regardless of checks", () => {
    const plan = planBulk("visible", ["x"], ["a", "b"]);
    expect(plan.ids).toEqual(["a", "b"]);
    expect(plan.hiddenSkipped).toBe(1);
  });

  it("empty scope yields an empty plan (UI disables the action)", () => {
    expect(planBulk("selected", [], ["a"]).ids).toEqual([]);
    expect(planBulk("visible", [], []).ids).toEqual([]);
  });
});

describe("bulkSummary", () => {
  it("counts affected rows, missing pairs and real changes for the dialog", () => {
    // a, b are pending; ok1 already approved — 2 real changes, 1 missing side
    const s = bulkSummary([pair("a"), pair("b", "ai"), pair("ok1")], ["a", "b", "ok1", "ghost"], "approved");
    expect(s).toEqual({ total: 3, missing: 1, changing: 2 });
  });

  it("rows already carrying the verdict are not counted as changing", () => {
    const s = bulkSummary([pair("ok1")], ["ok1"], "approved");
    expect(s).toEqual({ total: 1, missing: 0, changing: 0 });
  });
});

describe("bulkResultText", () => {
  it("one success message with affected/unaffected counts (no per-image noise)", () => {
    const t = bulkResultText("approved", 5, 2, true);
    expect(t).toContain("5");
    expect(t).toContain("2");
    expect(t).toContain("saved");
  });

  it("failure keeps the counts and says decisions stay in memory", () => {
    const t = bulkResultText("declined", 3, 1, false);
    expect(t).toContain("3");
    expect(t).toContain("1");
    expect(t).toContain("0 of 3 saved");
    expect(t.toLowerCase()).toContain("memory");
  });
});
