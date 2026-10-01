// reviewfile.test.ts — RULE 8/13: decision records, corrupt tolerance,
// rename carry-over and rescan diffing for Selection review.
import { describe, expect, it } from "vitest";
import {
  carryRenamed, diffPairs, mergeDecisions, parseDecisions, patchRecords, serializeDecisions,
  type ReviewRecord,
} from "../src/lib/reviewfile";
import type { ReviewPair } from "../src/lib/pairing";
import type { Decision, ViewPair } from "../src/lib/reviewfilter";

function pair(id: string, size: number, mtime: number, dir = "a"): ReviewPair {
  return {
    pairId: id, base: id, relDir: dir,
    source: { relPath: `${dir}/${id}.png`, size, mtime },
    ai: { relPath: `${dir}/${id}_AI.png`, size: size + 1, mtime: mtime + 1 },
    created: mtime, generated: mtime + 1,
  };
}

const REC: ReviewRecord = {
  pair_id: "pair_1", source: "a/pair_1.png", ai_result: "a/pair_1_AI.png",
  decision: "approved", reviewed_at: "2026-10-01T10:00:00.000Z",
};

describe("parseDecisions", () => {
  it("accepts a valid payload and validates each field", () => {
    const r = parseDecisions(JSON.stringify({ records: [REC] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.records[0].decision).toBe("approved");
  });

  it("drops individually bad records but keeps good ones", () => {
    const bad = { ...REC, pair_id: 5 };
    const r = parseDecisions(JSON.stringify({ records: [REC, bad] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.records).toHaveLength(1);
  });

  it("flags corrupt payloads instead of losing data silently", () => {
    expect(parseDecisions("{not json").ok).toBe(false);
    expect(parseDecisions("[1,2]").ok).toBe(false);
    expect(parseDecisions("").ok).toBe(false);
  });
});

describe("serializeDecisions", () => {
  it("round-trips and sorts by pair_id for stable diffs", () => {
    const b = { ...REC, pair_id: "pair_b" };
    const text = serializeDecisions([b, REC]);
    const parsed = JSON.parse(text);
    expect(parsed.records.map((x: ReviewRecord) => x.pair_id)).toEqual(["pair_1", "pair_b"]);
    expect(parseDecisions(text).ok).toBe(true);
  });
});

describe("mergeDecisions", () => {
  it("applies stored decisions; unknown pairs stay pending", () => {
    const merged = mergeDecisions([pair("pair_1", 1, 2), pair("pair_2", 3, 4)], [REC]);
    expect(merged.byId.get("pair_1")?.decision).toBe("approved");
    expect(merged.byId.get("pair_1")?.reviewedAt).toBe(REC.reviewed_at);
    expect(merged.byId.get("pair_2")?.decision).toBe("pending");
  });

  it("keeps orphan records so transiently missing files never lose decisions", () => {
    const merged = mergeDecisions([pair("pair_2", 3, 4)], [REC]);
    expect(merged.orphans).toEqual([REC]);
  });
});

describe("carryRenamed — decisions survive renames/moves", () => {
  it("inherits decision when identity matches a vanished pair", () => {
    const oldP = pair("pair_old", 42, 777, "old");
    const moved = pair("pair_new", 42, 777, "new");
    const res = carryRenamed([oldP], [moved], new Map([["pair_old", REC.decision === "approved" ? { ...REC } : REC]]));
    expect(res.renamed).toBe(1);
    expect(res.byId.get("pair_new")?.decision).toBe("approved");
  });

  it("does not carry when size or mtime differ", () => {
    const oldP = pair("pair_old", 42, 777, "old");
    const changed = pair("pair_new", 43, 777, "new");
    const res = carryRenamed([oldP], [changed], new Map([["pair_old", REC]]));
    expect(res.renamed).toBe(0);
    expect(res.byId.get("pair_new")?.decision).toBe("pending");
  });
});

describe("diffPairs", () => {
  it("counts added/removed/renamed/unchanged", () => {
    const prev: ViewPair[] = [
      { ...pair("pair_a", 1, 10), decision: "pending", reviewedAt: null },
      { ...pair("pair_gone", 2, 20), decision: "pending", reviewedAt: null },
    ];
    const curr = [pair("pair_a", 1, 10), pair("pair_new", 3, 30)];
    const d = diffPairs(prev, curr);
    expect(d).toEqual({ added: 1, removed: 1, renamed: 0, unchanged: 1 });
  });
});

describe("patchRecords — an offline undo/redo write", () => {
  const rec = (id: string, decision: Decision): ReviewRecord => ({
    pair_id: id, source: `a/${id}.png`, ai_result: null, decision, reviewed_at: "2026-10-01T12:00:00.000Z",
  });
  const stored = [rec("a", "approved"), rec("b", "declined"), rec("orphan", "approved")];

  it("replaces only the touched records", () => {
    const out = patchRecords(stored, ["a"], [rec("a", "declined")]);
    expect(out.map((r) => `${r.pair_id}:${r.decision}`).sort()).toEqual(["a:declined", "b:declined", "orphan:approved"]);
  });

  it("removes the record of a pair that returns to pending (I-13)", () => {
    expect(patchRecords(stored, ["a", "b"], []).map((r) => r.pair_id)).toEqual(["orphan"]);
  });

  it("ignores patch records for ids nobody asked about", () => {
    const out = patchRecords(stored, ["a"], [rec("a", "declined"), rec("zzz", "approved")]);
    expect(out.map((r) => r.pair_id).sort()).toEqual(["a", "b", "orphan"]);
  });

  it("leaves the stored list alone when nothing is touched", () => {
    expect(patchRecords(stored, [], [rec("a", "declined")])).toEqual(stored);
  });
});
