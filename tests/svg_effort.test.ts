// svg_effort.test.ts — the reasoning level really caps a request (RULE 8):
// medium sends at most 2 icons, high at most 1, and the timeout is raised to
// the documented floor for the tier instead of failing with a bare error.
// Each assertion fails if src/lib/effortlimits.ts is deleted or neutered.
import { describe, expect, it } from "vitest";
import {
  EFFORT_RULES, effectivePerRequest, effectiveTimeoutMs, effortRule, limitNote, timeoutHint,
} from "../src/lib/effortlimits";
import { capsFor, type Effort, type SamplingParams } from "../src/lib/modelcaps";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";

const REASONING = capsFor(DEFAULT_CONFIG.model); // openai/gpt-6.1-sol reasons
const CLASSIC = capsFor("openai/gpt-4o"); // no effort offered at all

function params(effort: Effort | null): SamplingParams {
  return { temperature: null, maxTokens: 32_000, effort };
}

describe("effectivePerRequest — the effort caps the batch size", () => {
  it("caps medium at 2 and high at 1, however many images were configured", () => {
    expect(effectivePerRequest(4, REASONING, params("medium"))).toBe(2);
    expect(effectivePerRequest(9, REASONING, params("medium"))).toBe(2);
    expect(effectivePerRequest(4, REASONING, params("high"))).toBe(1);
    expect(effectivePerRequest(9, REASONING, params("high"))).toBe(1);
    expect(effectivePerRequest(9, REASONING, params("xhigh"))).toBe(1);
  });

  it("leaves low and the provider default at the configured value", () => {
    expect(effectivePerRequest(4, REASONING, params("low"))).toBe(4);
    expect(effectivePerRequest(9, REASONING, params("low"))).toBe(9);
    expect(effectivePerRequest(4, REASONING, params(null))).toBe(4);
  });

  it("never increases a smaller configured value, and clamps nonsense", () => {
    expect(effectivePerRequest(1, REASONING, params("low"))).toBe(1);
    expect(effectivePerRequest(1, REASONING, params("high"))).toBe(1);
    expect(effectivePerRequest(0, REASONING, params(null))).toBe(1);
    expect(effectivePerRequest(99, REASONING, params(null))).toBe(9);
  });

  it("applies no cap when the model is not offered the effort", () => {
    expect(effortRule(CLASSIC, params("high"))).toBeNull();
    expect(effectivePerRequest(4, CLASSIC, params("high"))).toBe(4);
  });
});

describe("effectiveTimeoutMs — the wait is raised to the tier floor", () => {
  it("uses the documented floors for medium and high", () => {
    expect(EFFORT_RULES.medium.timeoutMs).toBeGreaterThanOrEqual(300_000);
    expect(EFFORT_RULES.high.timeoutMs).toBeGreaterThanOrEqual(600_000);
    expect(effectiveTimeoutMs(90_000, REASONING, params("medium"))).toBe(EFFORT_RULES.medium.timeoutMs);
    expect(effectiveTimeoutMs(90_000, REASONING, params("high"))).toBe(EFFORT_RULES.high.timeoutMs);
    expect(effectiveTimeoutMs(90_000, REASONING, params("low"))).toBe(120_000);
  });

  it("never shortens a longer configured timeout, and never touches the default", () => {
    expect(effectiveTimeoutMs(600_000, REASONING, params("high"))).toBe(600_000);
    expect(effectiveTimeoutMs(900_000, REASONING, params("medium"))).toBe(900_000);
    expect(effectiveTimeoutMs(90_000, REASONING, params(null))).toBe(90_000);
    expect(effectiveTimeoutMs(90_000, CLASSIC, params("high"))).toBe(90_000);
  });

  it("says the effective wait in a timeout error instead of a bare failure", () => {
    const hint = timeoutHint(REASONING, params("high"), 600_000);
    expect(hint).toContain("600s");
    expect(hint).toContain("high");
    expect(hint.toLowerCase()).toContain("timeout");
    expect(timeoutHint(REASONING, params(null), 90_000)).toContain("90s");
  });
});

describe("limitNote — what changed, said out loud", () => {
  it("names the tier and the cap when the effort forced a split", () => {
    const note = limitNote(4, REASONING, params("high"));
    expect(note).toContain("high");
    expect(note).toContain("1");
    expect(limitNote(4, REASONING, params("medium"))).toContain("2");
  });

  it("is silent when nothing was capped", () => {
    expect(limitNote(4, REASONING, params("low"))).toBeNull();
    expect(limitNote(1, REASONING, params("high"))).toBeNull();
    expect(limitNote(4, REASONING, params(null))).toBeNull();
  });
});
