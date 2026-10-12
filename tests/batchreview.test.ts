// batchreview.test.ts — the split-review pure semantics (RULE 8): classification
// (exactly N -> approved, everything else -> declined), the expected-icons
// clamp, the gate filter, and the review field's state-file round-trip.

import { describe, expect, it } from "vitest";
import { approvedChecked, classifySplitCount, clampExpectedIcons, DEFAULT_EXPECTED_ICONS, isDecidableRow } from "../src/lib/batchreview";
import { mergeScan, parseState, serializeState, blankState, type SourceRecord } from "../src/lib/statefile";

describe("classifySplitCount — exactly N icons is approved, every other outcome declined", () => {
  it("count === expected approves", () => {
    expect(classifySplitCount(4, 4)).toBe("approved");
    expect(classifySplitCount(1, 1)).toBe("approved");
    expect(classifySplitCount(9, 9)).toBe("approved");
  });

  it("fewer, more or zero icons decline (never silently pass the gate)", () => {
    expect(classifySplitCount(3, 4)).toBe("declined");
    expect(classifySplitCount(5, 4)).toBe("declined");
    expect(classifySplitCount(0, 4)).toBe("declined");
  });
});

describe("clampExpectedIcons — junk falls back, range clamps (RULE 13)", () => {
  it("default is 4", () => {
    expect(DEFAULT_EXPECTED_ICONS).toBe(4);
    expect(clampExpectedIcons(undefined)).toBe(4);
    expect(clampExpectedIcons("x")).toBe(4);
    expect(clampExpectedIcons(NaN)).toBe(4);
    expect(clampExpectedIcons(Infinity)).toBe(4);
  });

  it("integers in range pass, fractions truncate, out of range clamps", () => {
    expect(clampExpectedIcons(6)).toBe(6);
    expect(clampExpectedIcons(4.7)).toBe(4);
    expect(clampExpectedIcons(0)).toBe(1);
    expect(clampExpectedIcons(-3)).toBe(1);
    expect(clampExpectedIcons(100)).toBe(64);
  });
});

describe("gate helpers", () => {
  it("a missing/deleted row is not decidable", () => {
    expect(isDecidableRow({ status: "unprocessed" })).toBe(true);
    expect(isDecidableRow({ status: "processed" })).toBe(true);
    expect(isDecidableRow({ status: "missing" })).toBe(false);
    expect(isDecidableRow({ status: "deleted" })).toBe(false);
  });

  it("only checked AND approved rows are splittable", () => {
    const rows = [
      { selected: true, review: "approved" },
      { selected: true, review: "pending" },
      { selected: false, review: "approved" },
      { selected: true, review: "declined" },
    ] as { selected: boolean; review: "approved" | "pending" | "declined" }[];
    expect(approvedChecked(rows)).toHaveLength(1);
    expect(approvedChecked(rows)[0]).toEqual({ selected: true, review: "approved" });
  });
});

describe("review persistence in the per-reference state file", () => {
  const scanItem = { relPath: "f/icon-a_AI_1.png", name: "icon-a_AI_1.png", size: 10, mtime: 1000, refRelPath: "f/icon-a_1.png" };

  function recordWith(review: string | undefined): SourceRecord | undefined {
    const prev = blankState("icon-a");
    if (review !== undefined) {
      prev.sources = [{ relPath: scanItem.relPath, name: scanItem.name, size: 10, mtime: 1000, status: "unprocessed", updated: "t0", review } as SourceRecord];
    }
    const merged = mergeScan(prev, [scanItem], "t1");
    return merged.sources[0];
  }

  it("a rescan preserves the decision", () => {
    expect(recordWith("approved")?.review).toBe("approved");
    expect(recordWith("declined")?.review).toBe("declined");
  });

  it("a fresh record has no review yet (reads as pending)", () => {
    expect(recordWith(undefined)?.review).toBeUndefined();
  });

  it("serialize -> parse round-trips a decision and drops a corrupt one", () => {
    const prev = blankState("icon-a");
    prev.sources = [{ relPath: scanItem.relPath, name: scanItem.name, size: 10, mtime: 1000, status: "processed", updated: "t0", review: "approved" }];
    const parsed = parseState(serializeState(prev));
    expect(parsed?.sources[0].review).toBe("approved");
    const junk = JSON.parse(serializeState(prev));
    junk.sources[0].review = "bogus";
    const repaired = parseState(JSON.stringify(junk));
    expect(repaired?.sources[0].review).toBeUndefined();
  });
});
