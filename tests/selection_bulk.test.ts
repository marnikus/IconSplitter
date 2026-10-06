// selection_bulk.test.ts — RULE 8: the bulk reducer is one state transition
// for the whole batch (spec V2 §6/§11): records rebuilt once, changed
// decisions update the existing record, incomplete pairs untouched.
import { describe, expect, it } from "vitest";
import { applyScan, initialSelState, withBulkDecision, type SelState } from "../src/selection/state";
import { reviewPair } from "./helpers/reviewpairs";

const NOW = "2026-10-01T12:00:00.000Z";

function scanned(): SelState {
  return applyScan(
    initialSelState(),
    [reviewPair("a"), reviewPair("b"), reviewPair("c", { noAi: true })],
    { records: [], corrupt: false },
    1,
  );
}

describe("withBulkDecision", () => {
  it("applies one decision to every eligible pair in a single transition", () => {
    const out = withBulkDecision(scanned(), ["a", "b"], "approved", NOW);
    expect(out.applied).toEqual(["a", "b"]);
    expect(out.skipped).toEqual([]);
    expect(out.state.pairs.map((p) => p.decision)).toEqual(["approved", "approved", "pending"]);
    expect(out.state.pairs.filter((p) => p.reviewedAt === NOW)).toHaveLength(2);
  });

  it("reports skipped incomplete pairs without changing them", () => {
    const out = withBulkDecision(scanned(), ["a", "c"], "approved", NOW);
    expect(out).toMatchObject({ applied: ["a"], skipped: ["c"] });
    expect(out.state.pairs.find((p) => p.pairId === "c")?.decision).toBe("pending");
    expect(out.state.pairs.find((p) => p.pairId === "c")?.reviewedAt).toBeNull();
  });

  it("rewrites one record per pair when a decision changes", () => {
    const first = withBulkDecision(scanned(), ["a"], "approved", NOW);
    const second = withBulkDecision(first.state, ["a"], "declined", "2026-10-01T13:00:00.000Z");
    const recs = second.state.records.filter((r) => r.pair_id === "a");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ decision: "declined", reviewed_at: "2026-10-01T13:00:00.000Z" });
  });

  it("leaves state identical (same object) when nothing is eligible", () => {
    const s = scanned();
    const out = withBulkDecision(s, ["c"], "approved", NOW);
    expect(out.state).toBe(s);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toEqual(["c"]);
  });

  it("an empty batch is a no-op", () => {
    const s = scanned();
    expect(withBulkDecision(s, [], "approved", NOW).state).toBe(s);
  });

  it("decline works the same way as approve", () => {
    const out = withBulkDecision(scanned(), ["a", "b"], "declined", NOW);
    expect(out.state.pairs.map((p) => p.decision)).toEqual(["declined", "declined", "pending"]);
  });
});
