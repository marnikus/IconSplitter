// reviewreset.test.ts — RULE 8 / request §2: reset-to-pending scope, the one
// summary line a bulk reset reports, and the decision snapshot an undo entry
// carries. Reset is the safe direction, so it is allowed where approve is not.
import { describe, expect, it } from "vitest";
import { decisionLabel } from "../src/lib/reviewlabels";
import { decisionStates, missingTargets } from "../src/lib/reviewsnapshot";
import { bulkCheckLabel, checkLabel, viewLabel } from "../src/lib/reviewlabels";
import { isResettable, planReset, resetLabel, resetMessage } from "../src/lib/reviewreset";
import { viewPair } from "./helpers/reviewpairs";

const NOW = "2026-10-01T12:00:00.000Z";

describe("planReset", () => {
  it("resets every reviewed pair, pending ones are skipped not re-decided", () => {
    const pairs = [
      viewPair("a", { decision: "approved" }),
      viewPair("b", { decision: "pending" }),
      viewPair("c", { decision: "declined" }),
    ];
    const plan = planReset(pairs, ["a", "b", "c"]);
    expect(plan.resettable).toEqual(["a", "c"]);
    expect(plan.skipped).toEqual(["b"]);
  });

  it("allows an incomplete pair to reset: removing a decision is always safe", () => {
    const pairs = [viewPair("a", { decision: "approved", noAi: true }), viewPair("b", { decision: "approved" })];
    expect(planReset(pairs, ["a", "b"]).resettable).toEqual(["a", "b"]);
    expect(isResettable(pairs[0])).toBe(true);
  });

  it("skips ids the current scan does not know (deleted while checked)", () => {
    const plan = planReset([viewPair("a", { decision: "approved" })], ["a", "gone"]);
    expect(plan.resettable).toEqual(["a"]);
    expect(plan.skipped).toEqual(["gone"]);
  });
});

describe("reset copy", () => {
  it("names the reset action for the history label", () => {
    expect(resetLabel(1)).toBe("Reset 1 pair to pending");
    expect(resetLabel(14)).toBe("Reset 14 pairs to pending");
  });

  it("reports one honest summary line for a bulk reset", () => {
    expect(resetMessage({ applied: 14, skipped: 0, saved: true })).toBe("14 pairs reset to pending");
    expect(resetMessage({ applied: 1, skipped: 0, saved: true })).toBe("1 pair reset to pending");
    expect(resetMessage({ applied: 2, skipped: 3, saved: true })).toBe("2 pairs reset to pending · 3 skipped (already pending or gone)");
    expect(resetMessage({ applied: 1, skipped: 0, saved: false })).toBe("1 pair reset to pending · save failed — retry");
    expect(resetMessage({ applied: 0, skipped: 4, saved: true })).toBe("No reviewed pairs to reset · 4 skipped (already pending or gone)");
  });

  it("labels approve/decline entries for the Undo tooltip (request §6)", () => {
    expect(decisionLabel("approved", 14)).toBe("Approve 14 pairs");
    expect(decisionLabel("approved", 1)).toBe("Approve 1 pair");
    expect(decisionLabel("declined", 3)).toBe("Decline 3 pairs");
    expect(decisionLabel("pending", 2)).toBe("Reset 2 pairs to pending");
    expect(decisionLabel("approved", 1, "fog")).toBe("Approve “fog”");
  });

  it("labels checkbox and view entries so the tooltip is never ambiguous", () => {
    expect(checkLabel(true, "fog")).toBe("Check “fog”");
    expect(checkLabel(false, "fog")).toBe("Uncheck “fog”");
    expect(bulkCheckLabel("visible", true, 4)).toBe("Select visible (4 pairs)");
    expect(bulkCheckLabel("all", false, 4)).toBe("Deselect all (4 pairs)");
    expect(viewLabel("Zoom", "128 px")).toBe("Zoom: 128 px");
  });
});

describe("decision snapshots (history before/after)", () => {
  it("captures the minimal review state of the affected ids only", () => {
    const pairs = [
      viewPair("a", { decision: "approved" }),
      viewPair("b"),
    ];
    pairs[0].reviewedAt = NOW;
    expect(decisionStates(pairs, ["a"])).toEqual([{ id: "a", decision: "approved", reviewedAt: NOW }]);
  });

  it("keeps the visible-list order and ignores unknown ids", () => {
    const pairs = [viewPair("a"), viewPair("b")];
    expect(decisionStates(pairs, ["b", "gone", "a"]).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("reports which targets a stale entry can no longer reach", () => {
    const pairs = [viewPair("a")];
    expect(missingTargets(pairs, ["a", "x", "y"])).toEqual(["x", "y"]);
    expect(missingTargets(pairs, ["a"])).toEqual([]);
  });
});
