// svg_budget.test.ts — the request budget derived from the reasoning effort
// (RULE 8). A reasoning model spends its completion ceiling on thinking AND on
// the answer, and takes longer the harder it thinks: a flat 32 000-token /
// 90-second budget is what made 3–4 icons fail at medium effort and one icon
// per run at high. Every derivation below is pure, so each rule is asserted on
// its own.
import { describe, expect, it } from "vitest";
import {
  budgetFor,
  imagesPerRequestFor,
  maxTokensFor,
  REASONING_WEIGHT,
  requestBudgetFor,
  timeoutMsFor,
  TIMEOUT_CEILING_MS,
  weightOf,
} from "../src/lib/svgbudget";

const BASE = { images: 4, maxTokens: 32_000, timeoutMs: 90_000, tokenCeiling: 200_000 };

describe("effort weights", () => {
  it("weights every tier the picker offers, and the provider default as 1", () => {
    expect(REASONING_WEIGHT).toEqual({ low: 1, medium: 2, high: 4, xhigh: 8 });
    expect(weightOf(null)).toBe(1);
    expect(weightOf("low")).toBe(1);
    expect(weightOf("medium")).toBe(2);
    expect(weightOf("high")).toBe(4);
    expect(weightOf("xhigh")).toBe(8);
  });
});

describe("maxTokensFor — the ceiling the reasoning is paid out of", () => {
  it("gives the artwork back the room the effort spends", () => {
    expect(maxTokensFor("low", 32_000, 200_000)).toBe(32_000);
    expect(maxTokensFor("medium", 32_000, 200_000)).toBe(64_000);
    expect(maxTokensFor("high", 32_000, 200_000)).toBe(128_000);
    expect(maxTokensFor(null, 32_000, 200_000)).toBe(32_000);
  });

  it("never exceeds what the model accepts and never drops below the user's value", () => {
    expect(maxTokensFor("high", 32_000, 64_000)).toBe(64_000);
    expect(maxTokensFor("xhigh", 32_000, 200_000)).toBe(200_000);
    expect(maxTokensFor("low", 1_000, 200_000)).toBe(1_000);
  });
});

describe("timeoutMsFor — the wall clock a batch is allowed", () => {
  it("scales with the effort and the number of images in the batch", () => {
    expect(timeoutMsFor("low", 4, 90_000)).toBe(180_000);
    expect(timeoutMsFor("medium", 4, 90_000)).toBe(360_000);
    expect(timeoutMsFor("high", 2, 90_000)).toBe(360_000);
    expect(timeoutMsFor("high", 1, 90_000)).toBe(180_000);
  });

  it("never waits less than the user's own timeout, however small the batch", () => {
    expect(timeoutMsFor("low", 1, 90_000)).toBe(90_000);
    expect(timeoutMsFor("low", 1, 20_000)).toBe(20_000);
  });

  it("never waits past the app safety ceiling", () => {
    expect(timeoutMsFor("high", 9, 90_000)).toBe(TIMEOUT_CEILING_MS);
    expect(timeoutMsFor("xhigh", 4, 90_000)).toBe(TIMEOUT_CEILING_MS);
  });

  it("keeps the user's own ceiling when they raised it", () => {
    expect(timeoutMsFor("low", 1, 120_000)).toBe(120_000);
  });
});

describe("imagesPerRequestFor — a batch that can still finish", () => {
  it("uses the observed safe per-request size at each effort, within the user's setting", () => {
    expect(imagesPerRequestFor("low", 4, 90_000)).toBe(4);
    expect(imagesPerRequestFor("low", 9, 90_000)).toBe(4);
    expect(imagesPerRequestFor("medium", 4, 90_000)).toBe(2);
    expect(imagesPerRequestFor("high", 4, 90_000)).toBe(1);
    expect(imagesPerRequestFor("xhigh", 4, 90_000)).toBe(1);
    expect(imagesPerRequestFor(null, 4, 90_000)).toBe(4);
  });

  it("never plans an empty or above-tier batch", () => {
    expect(imagesPerRequestFor("high", 0, 90_000)).toBe(1);
    expect(imagesPerRequestFor("low", 99, 90_000)).toBe(4);
  });
});

describe("requestBudgetFor — the one budget a run is sent with", () => {
  it("derives all three numbers from the effort and the user's settings", () => {
    expect(requestBudgetFor("medium", BASE)).toEqual({
      effort: "medium", imagesPerRequest: 2, maxTokens: 64_000, timeoutMs: 90_000,
    });
    expect(requestBudgetFor("high", BASE)).toEqual({
      effort: "high", imagesPerRequest: 1, maxTokens: 128_000, timeoutMs: 90_000,
    });
  });

  it("states the timeout a FULL batch is allowed, for the dialog and the limits line", () => {
    expect(budgetFor("medium", BASE)).toEqual({
      effort: "medium", imagesPerRequest: 2, maxTokens: 64_000, timeoutMs: 180_000,
    });
    expect(budgetFor("low", BASE)).toEqual({
      effort: "low", imagesPerRequest: 4, maxTokens: 32_000, timeoutMs: 180_000,
    });
  });
});
