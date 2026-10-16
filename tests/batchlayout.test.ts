// batchlayout.test.ts — the output-layout name patterns, one source (RULE 10).
// 2026-10-16 spec: a run level is a DAY (`YYYY-MM-DD`); the legacy timestamp
// form stays recognized — exports already on disk keep their scope (I-50).
import { describe, expect, it } from "vitest";
import { isMonthName, isRunStamp } from "../src/lib/batchlayout";

describe("isRunStamp — day-level run folders, legacy stamps still valid", () => {
  it("accepts the new day-only run folder", () => {
    expect(isRunStamp("2026-10-16")).toBe(true);
  });

  it("still accepts the legacy timestamp run folder (older exports on disk)", () => {
    expect(isRunStamp("2026-10-16_13-35-40")).toBe(true);
  });

  it("a month, a reversed date or any other name is not a run folder", () => {
    expect(isRunStamp("2026-10")).toBe(false);
    expect(isRunStamp("16-10-2026")).toBe(false);
    expect(isRunStamp("split_01")).toBe(false);
    expect(isRunStamp("2026-10-16_13-35")).toBe(false);
  });

  it("months keep their own strict shape", () => {
    expect(isMonthName("2026-10")).toBe(true);
    expect(isMonthName("2026-10-16")).toBe(false);
  });
});
