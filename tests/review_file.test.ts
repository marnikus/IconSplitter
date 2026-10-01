// TDD cycle R2 — reviewfile: the decision JSON model (spec §8, RULE 13).
// missing ⇒ pending, corrupt ⇒ explicit refusal (never a silent wipe),
// upsert changes the existing record, syncRecords keeps history.
import { describe, expect, it } from "vitest";
import {
  blankReviewFile, parseReviewFile, recordIndex, REVIEW_VERSION, serializeReviewFile,
  syncRecords, upsertRecord, type Decision, type DecisionRecord,
} from "../src/lib/reviewfile";

const rec = (id: string, decision: Decision = "approved", reviewed = "2026-10-01T10:00:00.000Z"): DecisionRecord => ({
  pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`, decision, reviewed_at: reviewed,
});

describe("parseReviewFile (spec §8, RULE 13)", () => {
  it("round-trips a serialized file", () => {
    const file = upsertRecord(blankReviewFile(), rec("star", "declined"));
    const parsed = parseReviewFile(serializeReviewFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.records).toEqual([rec("star", "declined")]);
    expect(parsed.file.version).toBe(REVIEW_VERSION);
  });

  it("treats missing and blank text as an empty, pending file", () => {
    for (const text of ["", "   "]) {
      const parsed = parseReviewFile(text);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.file.records).toEqual([]);
    }
  });

  it("rejects junk, wrong shape, unknown version and unreadable records", () => {
    const cases = [
      "{oops", "[]", '{"version":1}', '{"version":99,"records":[]}',
      JSON.stringify({ version: 1, records: [{ pair_id: "a" }, 5] }),
      JSON.stringify({ version: 1, records: [{ pair_id: "a", decision: "maybe" }] }),
    ];
    for (const text of cases) {
      const parsed = parseReviewFile(text);
      expect(parsed.ok, text).toBe(false);
      if (!parsed.ok) expect(parsed.reason.length).toBeGreaterThan(5);
    }
  });
});

describe("upsertRecord (spec §8: update the existing record)", () => {
  it("adds new records and replaces the record for the same id in place", () => {
    const one = upsertRecord(blankReviewFile(), rec("a", "pending"));
    const two = upsertRecord(upsertRecord(one, rec("b", "approved")), rec("A", "declined", "2026-10-02T00:00:00.000Z"));
    expect(two.records).toHaveLength(2);
    expect(two.records[0].pair_id.toLowerCase()).toBe("a");
    expect(two.records[0].decision).toBe("declined");
    expect(two.records[0].reviewed_at).toBe("2026-10-02T00:00:00.000Z");
    expect(two.updated).not.toBe("");
  });

  it("indexes records case-insensitively", () => {
    const idx = recordIndex([rec("Cat/Star")]);
    expect(idx.get("cat/star")?.pair_id).toBe("Cat/Star");
  });
});

describe("syncRecords (spec §8/§9: missing file ⇒ pending, keep history)", () => {
  const pair = (id: string) => ({ id, source: `${id}.png`, ai: `${id}_AI.png` });

  it("creates a pending record for every new pair", () => {
    const { file, added } = syncRecords(blankReviewFile(), [pair("a"), pair("b")], "2026-10-01T00:00:00.000Z");
    expect(added).toBe(2);
    expect(file.records.map((r) => r.decision)).toEqual(["pending", "pending"]);
    expect(file.records[0].source).toBe("a.png");
    expect(file.records[0].ai_result).toBe("a_AI.png");
  });

  it("keeps existing decisions, refreshes paths and retains vanished pairs", () => {
    const withOld = upsertRecord(blankReviewFile(), rec("gone", "approved"));
    const { file, added } = syncRecords(withOld, [pair("gone"), pair("fresh")], "2026-10-01T00:00:00.000Z");
    expect(added).toBe(1);
    const byId = Object.fromEntries(file.records.map((r) => [r.pair_id, r.decision]));
    expect(byId).toEqual({ gone: "approved", fresh: "pending" });
  });

  it("is idempotent and never duplicates a record", () => {
    const first = syncRecords(blankReviewFile(), [pair("a")], "t1");
    const second = syncRecords(first.file, [pair("a")], "t2");
    expect(second.added).toBe(0);
    expect(second.file.records).toHaveLength(1);
  });

  it("records a missing side as an empty string", () => {
    const { file } = syncRecords(blankReviewFile(), [{ id: "solo", source: "solo.png", ai: null }], "t");
    expect(file.records[0].ai_result).toBe("");
  });
});
