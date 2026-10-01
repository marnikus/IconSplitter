// selection_state.test.ts — RULE 8/24: pure reducers behind useSelection.
import { describe, expect, it } from "vitest";
import {
  applyScan, counters, initialSelState, nextPendingId, recordsFromViews, withBulkDecision,
  withChecked, withDecision, withDecisionStates, withResetDecision, withViewPatch,
} from "../src/selection/state";
import { decisionStates } from "../src/lib/reviewsnapshot";
import type { ReviewPair } from "../src/lib/pairing";
import type { ReviewRecord } from "../src/lib/reviewfile";

function pair(id: string, size: number, mtime: number, dir = "a"): ReviewPair {
  return {
    pairId: id, base: id, relDir: dir,
    source: { relPath: `${dir}/${id}.png`, size, mtime },
    ai: { relPath: `${dir}/${id}_AI.png`, size: size + 1, mtime: mtime + 1 },
    created: mtime, generated: mtime + 1,
  };
}

/** a, b, c scanned with no stored decisions (shared by the new blocks). */
function scan() {
  return applyScan(initialSelState(), [pair("a", 1, 1), pair("b", 2, 2), pair("c", 3, 3)], { records: [], corrupt: false }, 1);
}

const REC = (id: string, decision: ReviewRecord["decision"]): ReviewRecord => ({
  pair_id: id, source: `a/${id}.png`, ai_result: `a/${id}_AI.png`,
  decision, reviewed_at: "2026-10-01T10:00:00.000Z",
});

describe("applyScan", () => {
  it("merges decisions, starts unknown pairs pending, sets defaults", () => {
    const s0 = initialSelState();
    const s1 = applyScan(s0, [pair("p1", 1, 10), pair("p2", 2, 20)], { records: [REC("p1", "approved")], corrupt: false }, 1000);
    expect(s1.pairs.find((p) => p.pairId === "p1")?.decision).toBe("approved");
    expect(s1.pairs.find((p) => p.pairId === "p2")?.decision).toBe("pending");
    expect(s1.selectedId).toBe(s1.pairs[0].pairId);
    expect(s1.lastRescanAt).toBe(1000);
    expect(s1.lastDiff.added).toBe(2);
  });

  it("carries decisions across renames and reports them", () => {
    const s0 = initialSelState();
    const s1 = applyScan(s0, [pair("old", 42, 777)], { records: [REC("old", "declined")], corrupt: false }, 1);
    const s2 = applyScan(s1, [pair("new", 42, 777, "moved")], { records: [], corrupt: false }, 2);
    // records were persisted under the old id; carry via identity on rescan
    const withRecs = applyScan(s1, [pair("new", 42, 777, "moved")], { records: [REC("old", "declined")], corrupt: false }, 2);
    expect(withRecs.pairs.find((p) => p.pairId === "new")?.decision).toBe("declined");
    expect(withRecs.lastDiff.renamed).toBe(1);
    // same image moved but no stored decision -> still counted as renamed
    expect(s2.lastDiff).toMatchObject({ added: 0, renamed: 1, removed: 0 });
  });

  it("keeps orphan records so decisions survive transiently missing files", () => {
    const s0 = initialSelState();
    const s1 = applyScan(s0, [pair("p1", 1, 10)], { records: [REC("p1", "approved"), REC("gone", "approved")], corrupt: false }, 1);
    expect(s1.records.map((r) => r.pair_id).sort()).toEqual(["gone", "p1"]);
  });

  it("surfaces corrupt payloads without losing prior decisions", () => {
    const s0 = initialSelState();
    const s1 = applyScan(s0, [pair("p1", 1, 10)], { records: [REC("p1", "approved")], corrupt: false }, 1);
    const s2 = applyScan(s1, [pair("p1", 1, 10)], { records: [], corrupt: true }, 2);
    expect(s2.corrupt).toBe(true);
    expect(s2.pairs.find((p) => p.pairId === "p1")?.decision).toBe("approved");
  });
});

describe("withDecision + recordsFromViews", () => {
  it("updates an existing decision and the ISO timestamp", () => {
    const s1 = applyScan(initialSelState(), [pair("p1", 1, 10)], { records: [], corrupt: false }, 1);
    const s2 = withDecision(s1, "p1", "approved", "2026-10-01T12:00:00.000Z");
    expect(s2.pairs[0].decision).toBe("approved");
    expect(s2.pairs[0].reviewedAt).toBe("2026-10-01T12:00:00.000Z");
    const s3 = withDecision(s2, "p1", "declined", "2026-10-01T13:00:00.000Z");
    expect(s3.pairs[0].decision).toBe("declined");
    expect(recordsFromViews(s3.pairs, s3.records)).toHaveLength(1);
  });

  it("ignores unknown pair ids", () => {
    const s1 = applyScan(initialSelState(), [pair("p1", 1, 10)], { records: [], corrupt: false }, 1);
    const s2 = withDecision(s1, "nope", "approved", "t");
    expect(s2.pairs[0].decision).toBe("pending");
  });
});

describe("nextPendingId", () => {
  const mk = () => {
    const s = applyScan(initialSelState(), [pair("a", 1, 1), pair("b", 2, 2), pair("c", 3, 3)], { records: [], corrupt: false }, 1);
    return withDecision(s, "b", "approved", "t");
  };

  it("rolls to the next pending after the current position, wrapping", () => {
    const s = mk();
    expect(nextPendingId(s.pairs, "a")).toBe("c");
    expect(nextPendingId(s.pairs, "c")).toBe("a");
  });

  it("null when nothing pending remains", () => {
    let s = mk();
    s = withDecision(s, "a", "approved", "t");
    s = withDecision(s, "c", "declined", "t");
    expect(nextPendingId(s.pairs, "a")).toBeNull();
  });
});

describe("counters", () => {
  it("totals by decision plus attention count", () => {
    const s = applyScan(initialSelState(), [pair("a", 1, 1), { ...pair("b", 2, 2), ai: null }], { records: [REC("a", "approved")], corrupt: false }, 1);
    const c = counters(s.pairs);
    expect(c).toEqual({ total: 2, pending: 1, approved: 1, declined: 0, attention: 1 });
  });
});

/* ── reset to pending + history application (request §2/§3) ─────────────── */

describe("withResetDecision", () => {
  it("clears the decision and the stored record, keeping the pair intact", () => {
    const s = scan();
    const decided = withDecision(s, "a", "approved", "2026-10-01T10:00:00.000Z");
    const out = withResetDecision(decided, ["a"]);
    expect(out.applied).toEqual(["a"]);
    expect(out.skipped).toEqual([]);
    const pair = out.state.pairs.find((p) => p.pairId === "a")!;
    expect(pair.decision).toBe("pending");
    expect(pair.reviewedAt).toBeNull();
    expect(pair.source).not.toBeNull(); // source/AI sides and metadata survive
    expect(pair.ai).not.toBeNull();
    expect(out.state.records.some((r) => r.pair_id === "a")).toBe(false); // I-13
  });

  it("skips pairs that are already pending and never touches their neighbours", () => {
    const s = scan();
    const decided = withDecision(s, "b", "declined", "t");
    const out = withResetDecision(decided, ["a", "b", "gone"]);
    expect(out.applied).toEqual(["b"]);
    expect(out.skipped).toEqual(["a", "gone"]);
    expect(out.state.records).toEqual([]); // b's record is gone, nothing else was reviewed
    expect(out.state.pairs.map((p) => p.decision)).toEqual(["pending", "pending", "pending"]);
  });
});

describe("withDecisionStates (undo/redo replay)", () => {
  it("restores a snapshot atomically and rebuilds the records once", () => {
    const s = withBulkDecision(scan(), ["a", "b"], "approved", "2026-10-01T10:00:00.000Z").state;
    const before = decisionStates(s.pairs, ["a", "b"]).map((d) => ({ ...d, decision: "pending" as const, reviewedAt: null }));
    const back = withDecisionStates(s, before);
    expect(back.changed).toBe(2);
    expect(back.state.pairs.map((p) => p.decision)).toEqual(["pending", "pending", "pending"]);
    expect(back.state.records).toEqual([]);
  });

  it("ignores ids the current scan no longer has (deleted target)", () => {
    const s = scan();
    const out = withDecisionStates(s, [{ id: "gone", decision: "approved", reviewedAt: "t" }]);
    expect(out.changed).toBe(0);
    expect(out.state).toBe(s);
  });

  it("re-applies a bulk snapshot as one transition", () => {
    const s = withBulkDecision(scan(), ["a", "b"], "approved", "2026-10-01T10:00:00.000Z").state;
    const snap = decisionStates(s.pairs, ["a", "b"]);
    const undone = withDecisionStates(s, snap.map((d) => ({ ...d, decision: "pending" as const, reviewedAt: null }))).state;
    const again = withDecisionStates(undone, snap);
    expect(again.state.pairs.map((p) => p.decision)).toEqual(["approved", "approved", "pending"]);
  });
});

describe("withChecked + withViewPatch", () => {
  it("keeps only ids the current scan knows, in one transition", () => {
    const s = withChecked(scan(), ["b", "gone", "a", "a"]);
    expect(s.checked).toEqual(["b", "a"]);
  });

  it("patches one persisted view value without touching the active row", () => {
    const s = { ...scan(), selectedId: "b" };
    const next = withViewPatch(s, { sort: { by: "name", dir: "asc" } });
    expect(next.sort).toEqual({ by: "name", dir: "asc" });
    expect(next.selectedId).toBe("b");
    expect(next.pairs).toBe(s.pairs);
  });
});
