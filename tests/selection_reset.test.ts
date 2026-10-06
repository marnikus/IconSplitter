// selection_reset.test.ts — RULE 8: "reset to pending" is a first-class
// decision transition. A pending pair owns no stored record (I-13), the pair
// itself and its file metadata are untouched, and a bulk reset is ONE
// transition so it can be one history entry and one summary message.
import { describe, expect, it } from "vitest";
import {
  applyScan, initialSelState, withBulkDecision, withRecords, withReset, type SelState,
} from "../src/selection/state";
import { reviewPair } from "./helpers/reviewpairs";

const NOW = "2026-10-01T12:00:00.000Z";

function reviewed(): SelState {
  const s = applyScan(
    initialSelState(),
    [reviewPair("a"), reviewPair("b"), reviewPair("c", { noAi: true })],
    { records: [], corrupt: false },
    1,
  );
  return withBulkDecision(s, ["a", "b"], "approved", NOW).state;
}

describe("withReset", () => {
  it("returns an approved pair to pending and clears its review timestamp", () => {
    const out = withReset(reviewed(), ["a"]);
    expect(out.applied).toEqual(["a"]);
    expect(out.skipped).toEqual([]);
    const a = out.state.pairs.find((p) => p.pairId === "a");
    expect(a?.decision).toBe("pending");
    expect(a?.reviewedAt).toBeNull();
  });

  it("removes the record so the JSON no longer claims a decision (I-13)", () => {
    const out = withReset(reviewed(), ["a"]);
    expect(out.state.records.map((r) => r.pair_id)).toEqual(["b"]);
  });

  it("resets a bulk in one transition", () => {
    const out = withReset(reviewed(), ["a", "b"]);
    expect(out.applied).toEqual(["a", "b"]);
    expect(out.state.records).toEqual([]);
    expect(out.state.pairs.filter((p) => p.decision === "pending")).toHaveLength(3);
  });

  it("skips pairs that are already pending and says so", () => {
    const out = withReset(reviewed(), ["a", "c"]);
    expect(out).toMatchObject({ applied: ["a"], skipped: ["c"] });
    expect(out.state.pairs.find((p) => p.pairId === "c")?.decision).toBe("pending");
  });

  it("skips ids that are not in the current scan", () => {
    expect(withReset(reviewed(), ["ghost"]).skipped).toEqual(["ghost"]);
  });

  it("returns the identical state object when nothing is applicable", () => {
    const s = reviewed();
    expect(withReset(s, ["c"]).state).toBe(s);
    expect(withReset(s, []).state).toBe(s);
  });

  it("preserves the pair, its paths and its file metadata", () => {
    const before = reviewed();
    const after = withReset(before, ["a"]).state;
    const a0 = before.pairs.find((p) => p.pairId === "a");
    const a1 = after.pairs.find((p) => p.pairId === "a");
    expect(a1).toMatchObject({
      pairId: a0?.pairId, base: a0?.base, relDir: a0?.relDir, created: a0?.created,
      source: a0?.source, ai: a0?.ai,
    });
  });

  it("a reset pair can be decided again, and that decision is stored once", () => {
    const reset = withReset(reviewed(), ["a"]).state;
    const again = withBulkDecision(reset, ["a"], "declined", "2026-10-01T13:00:00.000Z").state;
    const recs = again.records.filter((r) => r.pair_id === "a");
    expect(recs).toHaveLength(1);
    expect(recs[0].decision).toBe("declined");
  });
});

describe("withRecords — the canonical undo/redo apply path", () => {
  const rec = (id: string, decision: "approved" | "declined") => ({
    pair_id: id, source: `a/${id}.png`, ai_result: null, decision, reviewed_at: "2026-10-01T12:00:00.000Z",
  });

  it("restores the decision a history entry carries", () => {
    const reset = withReset(reviewed(), ["a"]).state; // a is pending again
    const out = withRecords(reset, ["a"], [rec("a", "approved")]); // redo
    expect(out.applied).toEqual(["a"]);
    expect(out.state.pairs.find((p) => p.pairId === "a")?.decision).toBe("approved");
    expect(out.state.records.map((r) => r.pair_id).sort()).toEqual(["a", "b"]);
  });

  it("returns a pair to pending when the entry holds no record (undo)", () => {
    const out = withRecords(reviewed(), ["a", "b"], [rec("b", "approved")]);
    expect(out.state.pairs.find((p) => p.pairId === "a")?.reviewedAt).toBeNull();
    expect(out.state.pairs.find((p) => p.pairId === "b")?.decision).toBe("approved");
    expect(out.state.records.map((r) => r.pair_id)).toEqual(["b"]);
  });

  it("skips a stale id instead of failing the whole apply", () => {
    const out = withRecords(reviewed(), ["ghost", "a"], [rec("a", "declined")]);
    expect(out).toMatchObject({ applied: ["a"], skipped: ["ghost"] });
  });

  it("changes nothing when every target is gone", () => {
    const s = reviewed();
    const out = withRecords(s, ["ghost"], [rec("ghost", "approved")]);
    expect(out.state).toBe(s);
    expect(out.applied).toEqual([]);
  });

  it("leaves untouched pairs exactly as they were", () => {
    const before = reviewed();
    const after = withRecords(before, ["a"], [rec("a", "declined")]).state;
    expect(after.pairs.find((p) => p.pairId === "b")).toBe(before.pairs.find((p) => p.pairId === "b"));
    expect(after.pairs.find((p) => p.pairId === "c")).toBe(before.pairs.find((p) => p.pairId === "c"));
  });
});
