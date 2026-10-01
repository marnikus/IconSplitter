// TDD cycle R3 — reviewmerge: pairs + decisions ⇒ review items, optimistic
// updates, counters, orphan history and restart persistence at model level.
import { describe, expect, it } from "vitest";
import { applyDecisions, orphanRecords, recordForItem, tally, withDecision } from "../src/lib/reviewmerge";
import type { DecisionRecord } from "../src/lib/reviewfile";
import { item, pair } from "./helpers/review";

const rec = (id: string, decision: DecisionRecord["decision"]): DecisionRecord => ({
  pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`, decision, reviewed_at: "2026-10-01T10:00:00.000Z",
});

describe("applyDecisions (spec §7 — no saved decision ⇒ pending)", () => {
  it("marks every pair pending when the review file is missing or empty", () => {
    const items = applyDecisions([pair("a"), pair("b")], []);
    expect(items.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(items[0].reviewedAt).toBeNull();
  });

  it("applies stored decisions and their timestamps, case-insensitively", () => {
    const items = applyDecisions([pair("Cat/Star")], [rec("cat/star", "approved")]);
    expect(items[0].status).toBe("approved");
    expect(items[0].reviewedAt).toBe("2026-10-01T10:00:00.000Z");
  });

  it("ignores records whose pair is not in the scan (they stay in the file)", () => {
    const items = applyDecisions([pair("a")], [rec("gone", "declined"), rec("a", "declined")]);
    expect(items.map((i) => i.id)).toEqual(["a"]);
    expect(items[0].status).toBe("declined");
  });

  it("keeps the decision after a fresh scan of the same folder (restart persistence)", () => {
    const first = withDecision(applyDecisions([pair("a")], []), "a", "approved", "2026-10-01T11:00:00.000Z");
    const stored = [recordForItem(first[0], "approved", "2026-10-01T11:00:00.000Z")];
    const rescanned = applyDecisions([pair("a")], stored);
    expect(rescanned[0].status).toBe("approved");
    expect(rescanned[0].reviewedAt).toBe("2026-10-01T11:00:00.000Z");
  });
});

describe("withDecision (spec §6 — change a previous decision, live update)", () => {
  it("updates only the target item, without mutating the input", () => {
    const before = applyDecisions([pair("a"), pair("b")], []);
    const after = withDecision(before, "b", "declined", "2026-10-02T00:00:00.000Z");
    expect(before[1].status).toBe("pending");
    expect(after[0].status).toBe("pending");
    expect(after[1].status).toBe("declined");
    expect(after[1].reviewedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("can flip an approved item to declined", () => {
    const approved = withDecision(applyDecisions([pair("a")], []), "a", "approved", "t1");
    const flipped = withDecision(approved, "a", "declined", "t2");
    expect(flipped[0].status).toBe("declined");
    expect(flipped[0].reviewedAt).toBe("t2");
  });
});

describe("recordForItem (spec §8 example record)", () => {
  it("stores the stable id, both relative paths, the decision and the timestamp", () => {
    const r = recordForItem(item("cat/star", "approved"), "approved", "2026-10-01T12:00:00.000Z");
    expect(r).toEqual({
      pair_id: "cat/star",
      source: "cat/star.png",
      ai_result: "cat/star_AI.png",
      decision: "approved",
      reviewed_at: "2026-10-01T12:00:00.000Z",
    });
  });

  it("uses an empty string for a side that does not exist on disk", () => {
    const r = recordForItem(item("solo", "declined", { ai: false }), "declined", "t");
    expect(r.ai_result).toBe("");
    expect(r.source).toBe("solo.png");
  });
});

describe("tally (spec §2 counters)", () => {
  it("counts total, pending, approved and declined", () => {
    const items = [item("a", "approved"), item("b", "declined"), item("c", "pending"), item("d", "pending")];
    expect(tally(items)).toEqual({ total: 4, pending: 2, approved: 1, declined: 1 });
  });

  it("is all zeroes for an empty review set", () => {
    expect(tally([])).toEqual({ total: 0, pending: 0, approved: 0, declined: 0 });
  });
});

describe("orphanRecords (spec §9 — missing files stay identifiable)", () => {
  it("returns stored records whose pair is no longer in the scan, ordered", () => {
    const orphans = orphanRecords([rec("zzz", "approved"), rec("a", "declined"), rec("live", "approved")], [pair("live")]);
    expect(orphans.map((r) => r.pair_id)).toEqual(["a", "zzz"]);
  });
});
