// reviewbulk.test.ts — RULE 4/8: the bulk rule is pure. Incomplete pairs are
// never approved silently, and one operation produces ONE summary line
// (spec V2 §6 — no toast per image).
import { describe, expect, it } from "vitest";
import { bulkMessage, bulkScope, planBulk } from "../src/lib/reviewbulk";
import { viewPair } from "./helpers/reviewpairs";

const PAIRS = [
  viewPair("ok1"),
  viewPair("ok2"),
  viewPair("noAi", { noAi: true }),
  viewPair("noSrc", { noSource: true }),
];

describe("planBulk", () => {
  it("keeps complete pairs eligible", () => {
    expect(planBulk(PAIRS, ["ok1", "ok2"])).toEqual({ eligible: ["ok1", "ok2"], skipped: [] });
  });

  it("skips a pair whose AI result is missing", () => {
    expect(planBulk(PAIRS, ["ok1", "noAi"])).toEqual({ eligible: ["ok1"], skipped: ["noAi"] });
  });

  it("skips a pair whose original is missing", () => {
    expect(planBulk(PAIRS, ["noSrc"])).toEqual({ eligible: [], skipped: ["noSrc"] });
  });

  it("skips ids that are not in the current scan (gone after a rescan)", () => {
    expect(planBulk(PAIRS, ["ghost"])).toEqual({ eligible: [], skipped: ["ghost"] });
  });

  it("an empty id list plans nothing", () => {
    expect(planBulk(PAIRS, [])).toEqual({ eligible: [], skipped: [] });
  });
});

describe("bulkScope — what a bulk action may touch", () => {
  const VISIBLE = [viewPair("ok1"), viewPair("ok2"), viewPair("noAi", { noAi: true })];

  it("affected = checked ∩ visible ∩ complete", () => {
    expect(bulkScope(VISIBLE, ["ok1", "ok2"]).affected).toEqual(["ok1", "ok2"]);
    expect(bulkScope(VISIBLE, ["ok1", "noAi"]).affected).toEqual(["ok1"]);
  });

  it("counts incomplete checks as blocked, never as affected", () => {
    expect(bulkScope(VISIBLE, ["ok1", "noAi"])).toEqual({ affected: ["ok1"], blocked: 1, hidden: 0 });
    expect(bulkScope(VISIBLE, ["noAi"])).toEqual({ affected: [], blocked: 1, hidden: 0 });
  });

  it("counts checks the current filters hide", () => {
    expect(bulkScope([VISIBLE[0]], ["ok1", "ok2"])).toEqual({ affected: ["ok1"], blocked: 0, hidden: 1 });
    expect(bulkScope([], ["ok1"])).toEqual({ affected: [], blocked: 0, hidden: 1 });
  });

  it("nothing checked means nothing to do", () => {
    expect(bulkScope(VISIBLE, [])).toEqual({ affected: [], blocked: 0, hidden: 0 });
  });
});

describe("bulkMessage — one honest line per operation", () => {
  it("plain success", () => {
    expect(bulkMessage({ decision: "approved", applied: 3, skipped: 0, saved: true }))
      .toBe("3 pairs approved");
  });

  it("singular wording for one pair", () => {
    expect(bulkMessage({ decision: "declined", applied: 1, skipped: 0, saved: true }))
      .toBe("1 pair declined");
  });

  it("names the unaffected count when pairs were skipped", () => {
    expect(bulkMessage({ decision: "approved", applied: 2, skipped: 3, saved: true }))
      .toBe("2 pairs approved · 3 skipped (incomplete or gone)");
  });

  it("reports a failed save distinctly from success (RULE 4)", () => {
    expect(bulkMessage({ decision: "approved", applied: 4, skipped: 0, saved: false }))
      .toBe("4 pairs approved · save failed — retry");
  });

  it("says honestly when nothing could be applied", () => {
    expect(bulkMessage({ decision: "approved", applied: 0, skipped: 2, saved: true }))
      .toBe("No eligible pairs · 2 skipped (incomplete or gone)");
  });
});

describe("bulkMessage for a reset", () => {
  it("says what a reset did and why the rest were skipped", () => {
    expect(bulkMessage({ decision: "pending", applied: 3, skipped: 0, saved: true })).toBe("3 pairs reset to pending");
    expect(bulkMessage({ decision: "pending", applied: 1, skipped: 2, saved: false }))
      .toBe("1 pair reset to pending · 2 skipped (already pending or gone) · save failed — retry");
    expect(bulkMessage({ decision: "pending", applied: 0, skipped: 4, saved: true }))
      .toBe("No eligible pairs · 4 skipped (already pending or gone)");
  });
});
