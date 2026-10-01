// selection_undo.test.ts — RULE 8: reset-to-pending, undo-aware mutations and
// applyUndoOut over decisions/filter kinds; rescan resets the timeline.
import { describe, expect, it } from "vitest";
import {
  applyScan, applyUndoOut, bulkReset, canRedo, canUndo, initialSelState,
  pushUndo, resetDecision, withDecision,
} from "../src/selection/state";
import { redoOnce, undoOnce } from "../src/lib/undo";
import { ALL_FILTER, type ListFilter } from "../src/lib/reviewfilter";
import type { ReviewPair } from "../src/lib/pairing";

function pair(id: string, t: number): ReviewPair {
  return {
    pairId: id, base: id, relDir: "d",
    source: { relPath: `d/${id}.png`, size: 1, mtime: t },
    ai: { relPath: `d/${id}_AI.png`, size: 2, mtime: t + 1 },
    created: t, generated: t + 1,
  };
}

const base = () => applyScan(initialSelState(), [pair("a", 1), pair("b", 2)], { records: [], corrupt: false }, 1);

describe("reset-to-pending", () => {
  it("clears decision + timestamp and drops the record", () => {
    let s = withDecision(base(), "a", "approved", "t1");
    expect(s.records).toHaveLength(1);
    s = resetDecision(s, "a");
    expect(s.pairs.find((p) => p.pairId === "a")?.decision).toBe("pending");
    expect(s.pairs.find((p) => p.pairId === "a")?.reviewedAt).toBeNull();
    expect(s.records).toHaveLength(0);
  });

  it("bulkReset resets many and ignores unknown ids", () => {
    let s = withDecision(base(), "a", "approved", "t1");
    s = withDecision(s, "b", "declined", "t2");
    s = bulkReset(s, ["a", "b", "zzz"]);
    expect(s.pairs.every((p) => p.decision === "pending")).toBe(true);
    expect(s.records).toHaveLength(0);
  });
});

describe("undo-aware state", () => {
  it("applyScan starts with an empty stack and a records baseline", () => {
    const s = base();
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
    expect(s.undoBase).toEqual([]);
  });

  it("undo walks snapshots; the frontier restores the baseline records", () => {
    const s0 = base();
    let s = withDecision(s0, "a", "approved", "t1");
    s = pushUndo(s, "decisions", s.records);
    s = withDecision(s, "a", "declined", "t2");
    s = pushUndo(s, "decisions", s.records);
    expect(canUndo(s)).toBe(true);
    const u = undoOnce(s.undo); // back to the approved snapshot
    const mid = applyUndoOut({ ...s, undo: u.stack }, u.out!);
    expect(mid.pairs.find((p) => p.pairId === "a")?.decision).toBe("approved");
    const u2 = undoOnce(mid.undo); // frontier 0 -> -1
    expect(u2.out?.empty).toBe(true);
    const first = applyUndoOut({ ...mid, undo: u2.stack }, u2.out!);
    expect(first.records).toEqual(s0.undoBase);
    expect(first.pairs.find((p) => p.pairId === "a")?.decision).toBe("pending");
    expect(canUndo(first)).toBe(false);
  });

  it("redo re-applies the stored snapshot", () => {
    let s = withDecision(base(), "a", "approved", "t1");
    s = pushUndo(s, "decisions", s.records);
    const u = undoOnce(s.undo);
    s = applyUndoOut({ ...s, undo: u.stack }, u.out!);
    const r = redoOnce(s.undo);
    s = applyUndoOut({ ...s, undo: r.stack }, r.out!);
    expect(s.pairs.find((p) => p.pairId === "a")?.decision).toBe("approved");
    expect(canRedo(s)).toBe(false);
  });

  it("filter entries: frontier undo restores ALL_FILTER, redo re-applies", () => {
    const f: ListFilter = { ...ALL_FILTER, status: "approved" };
    let s = pushUndo(base(), "filter", f);
    const u = undoOnce(s.undo);
    s = applyUndoOut({ ...s, undo: u.stack }, u.out!);
    expect(s.filter).toEqual(ALL_FILTER);
    const r = redoOnce(s.undo);
    s = applyUndoOut({ ...s, undo: r.stack }, r.out!);
    expect(s.filter.status).toBe("approved");
  });

  it("a rescan resets the timeline (external changes rewrite the domain)", () => {
    let s = withDecision(base(), "a", "approved", "t1");
    s = pushUndo(s, "decisions", s.records);
    s = applyScan(s, [pair("a", 1), pair("b", 2)], { records: s.records, corrupt: false }, 2);
    expect(canUndo(s)).toBe(false);
  });
});
