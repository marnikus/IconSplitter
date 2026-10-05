// svg_effort.test.ts — what the reasoning level may change, and what it must
// not (RULE 8). The tier raises the STALL WINDOW (how long silence is
// tolerated before a connection is presumed dead); it never caps the batch,
// never shortens the wait and never truncates the work. Each assertion fails
// if src/lib/effortlimits.ts starts limiting the user's batch again, or stops
// documenting the wait honestly.
import { describe, expect, it } from "vitest";
import {
  EFFORT_RULES, effectiveStallMs, effortRule, stallHint, stallLabel, stallNote,
} from "../src/lib/effortlimits";
import { capsFor, type Effort, type SamplingParams } from "../src/lib/modelcaps";
import { clampImagesPerRequest, DEFAULT_CONFIG } from "../src/lib/svgconfig";

const REASONING = capsFor(DEFAULT_CONFIG.model); // openai/gpt-6.1-sol reasons
const CLASSIC = capsFor("openai/gpt-4o"); // no effort offered at all

function params(effort: Effort | null): SamplingParams {
  return { temperature: null, maxTokens: 32_000, effort };
}

describe("the reasoning tier never shrinks the work", () => {
  it("has no icon cap in any tier rule", () => {
    for (const effort of ["low", "medium", "high", "xhigh"] as const) {
      expect(EFFORT_RULES[effort]).not.toHaveProperty("icons");
      expect(Object.keys(EFFORT_RULES[effort])).toEqual(["stallMs"]);
    }
  });

  it("keeps the user's batch size whatever the tier is", () => {
    // The app's only batch rule is the configured value, clamped 1..9.
    // (The runner, the confirmation and the panel all use this.)
    for (const configured of [1, 4, 8, 9]) {
      expect(clampImagesPerRequest(configured)).toBe(configured);
    }
    expect(clampImagesPerRequest(0)).toBe(1);
    expect(clampImagesPerRequest(99)).toBe(9);
  });
});

describe("effectiveStallMs — the wait is a liveness window, not a deadline", () => {
  it("raises a small configured window to the tier floor", () => {
    expect(EFFORT_RULES.low.stallMs).toBe(120_000);
    expect(EFFORT_RULES.medium.stallMs).toBe(300_000);
    expect(EFFORT_RULES.high.stallMs).toBe(600_000);
    expect(effectiveStallMs(90_000, REASONING, params("medium"))).toBe(300_000);
    expect(effectiveStallMs(90_000, REASONING, params("high"))).toBe(600_000);
    expect(effectiveStallMs(90_000, REASONING, params("low"))).toBe(120_000);
  });

  it("never shortens a longer configured window and never invents one without effort", () => {
    expect(effectiveStallMs(900_000, REASONING, params("high"))).toBe(900_000);
    expect(effectiveStallMs(120_000, REASONING, params(null))).toBe(120_000);
    expect(effectiveStallMs(120_000, CLASSIC, params("high"))).toBe(120_000);
    expect(effortRule(CLASSIC, params("high"))).toBeNull();
  });

  it("names the floor and says there is no total limit", () => {
    expect(stallLabel(120_000, REASONING, params("medium"))).toBe("300s stall (medium floor)");
    expect(stallLabel(120_000, REASONING, params(null))).toBe("120s stall");
    expect(stallLabel(900_000, REASONING, params("high"))).toBe("900s stall");
  });

  it("explains a raised window without ever claiming the batch shrank", () => {
    const note = stallNote(120_000, REASONING, params("medium")) ?? "";
    expect(note).toContain("medium");
    expect(note).toContain("300s");
    expect(note.toLowerCase()).toContain("batch");
    expect(note).toContain("as configured");
    expect(stallNote(120_000, REASONING, params(null))).toBeNull();
    expect(stallNote(600_000, REASONING, params("medium"))).toBeNull();
  });

  it("explains a stall without pretending it was a provider failure", () => {
    const hint = stallHint(REASONING, params("high"), 600_000);
    expect(hint).toContain("600s");
    expect(hint).toContain("high");
    expect(hint.toLowerCase()).toContain("no data");
    expect(hint.toLowerCase()).toContain("unknown");
    expect(hint.toLowerCase()).toContain("not been resent");
    expect(stallHint(REASONING, params(null), 120_000)).toContain("120s");
  });
});
