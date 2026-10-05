// pairmerge.test.ts — the records a scan applies (I-13/I-42): a pair's own file
// speaks for it whenever it carries a decision, and pending owns no record —
// the merge with the legacy fallback is covered through the store
// (tests/pairstore.test.ts, tests/legacyfile.test.ts).
import { describe, expect, it } from "vitest";
import { pairId, type ReviewPair } from "../src/lib/pairing";
import { toRecord } from "../src/lib/pairmerge";
import { newPairMeta, type PairMeta, type PairSide } from "../src/lib/pairmeta";

const SIDE_AI: PairSide = { relPath: "a/icon_AI.png", name: "icon_AI.png", fingerprint: "20:300" };
const SIDE_SRC: PairSide = { relPath: "a/icon.png", name: "icon.png", fingerprint: "12:200" };

function meta(extra: Partial<PairMeta> = {}): PairMeta {
  const m = newPairMeta({
    id: pairId("a", "icon", ""), base: "icon", suffix: "", dirPath: "a",
    ai: SIDE_AI, source: SIDE_SRC,
  });
  return { ...m, ...extra };
}

function pair(over: Partial<ReviewPair> = {}): ReviewPair {
  return {
    pairId: pairId("a", "icon", ""), base: "icon", suffix: "", relDir: "a",
    source: { relPath: SIDE_SRC.relPath, size: 12, mtime: 200, error: null },
    ai: { relPath: SIDE_AI.relPath, size: 20, mtime: 300, error: null },
    created: 200, generated: 300, ...over,
  };
}

describe("the record rules are unchanged (I-13)", () => {
  it("a pending pair owns no record, even after being reviewed before", () => {
    expect(toRecord(meta({ decision: "pending", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair())).toBeNull();
  });

  it("an approved pair's record names both faces and its timestamp", () => {
    const rec = toRecord(meta({ decision: "approved", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair());
    expect(rec).toEqual({
      pair_id: pairId("a", "icon", ""), source: SIDE_SRC.relPath, ai_result: SIDE_AI.relPath,
      decision: "approved", reviewed_at: "2026-10-05T17:02:11.000Z",
    });
  });

  it("a record is built from the pair on disk, so nothing is invented", () => {
    const rec = toRecord(meta({ decision: "declined", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair({ source: null }));
    expect(rec?.source).toBeNull();
    expect(rec?.ai_result).toBe(SIDE_AI.relPath);
  });
});
