// svg_cost.test.ts — the cost rules execute for real (RULE 8): the verified
// rate card and its version, the ONE decision between a provider-reported
// number and a calculated one, and the wording every surface shows. A provider
// number is never relabelled, a calculated number is always "Estimated", and a
// number nobody reported is never invented.
import { describe, expect, it } from "vitest";
import {
  PRICING_VERSION, PROVIDER_MARKUP, costInfoFor, estimateFromTokens, rateFor,
} from "../src/lib/svgpricing";
import { NO_USAGE, type Usage } from "../src/lib/svgrequest";
import { usageTotals, type SvgListRow } from "../src/lib/svglist";
import { allocateUsage, costLabel, costNote, costText } from "../src/lib/svgusage";

const MODEL = "openai/gpt-6.1-sol";

/** A provider answer that reported tokens but no cost. */
const tokensOnly: Usage = { input: 100_000, output: 20_000, total: 120_000, cost: null, currency: "USD" };

describe("svgpricing", () => {
  it("prices the configured model from the verified Requesty rate card", () => {
    expect(PRICING_VERSION).toBe("requesty-2026-10-01");
    expect(PROVIDER_MARKUP).toBe(1.05);
    expect(rateFor(MODEL)).toEqual({ input: 2, output: 10 });
    expect(rateFor("someone/unknown-model")).toBeNull();
    // 1M in + 1M out at $2 / $10 plus the 5% pay-as-you-go markup
    expect(estimateFromTokens(MODEL, { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(12.6, 6);
    expect(estimateFromTokens(MODEL, { input: 0, output: 0 })).toBe(0);
  });

  it("needs both token counts and a known model — anything less is unknown", () => {
    expect(estimateFromTokens(MODEL, { input: 1_000, output: null })).toBeNull();
    expect(estimateFromTokens(MODEL, { input: null, output: null })).toBeNull();
    expect(estimateFromTokens("someone/unknown-model", { input: 1_000, output: 1_000 })).toBeNull();
    expect(costInfoFor(MODEL, { input: null, output: null, total: 500, cost: null, currency: "USD" }))
      .toEqual({ actual: null, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "none" });
  });

  it("prefers the provider-reported cost over any calculation", () => {
    const reported: Usage = { input: 5, output: 6, total: 11, cost: 0.0021, currency: "USD" };
    expect(costInfoFor(MODEL, reported)).toEqual({
      actual: 0.0021, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "provider",
    });
    // the rate card never second-guesses a reported number, however odd the tokens
    expect(costInfoFor(MODEL, { ...reported, cost: 0.0000001 }).actual).toBe(0.0000001);
  });

  it("labels a calculated number as a batch share or a rate-card estimate", () => {
    const split = allocateUsage({ input: 40, output: 80, total: 120, cost: 0.04, currency: "USD" }, 4);
    expect(costInfoFor(MODEL, split)).toMatchObject({ actual: null, estimated: 0.01, basis: "batch-split" });
    expect(costInfoFor(MODEL, tokensOnly)).toMatchObject({ actual: null, basis: "rate-card" });
    expect(costInfoFor(MODEL, tokensOnly).estimated).toBeCloseTo(0.42, 6); // (0.2 + 0.2) * 1.05
    expect(costInfoFor(MODEL, split).currency).toBe("USD");
    expect(costInfoFor(MODEL, { ...tokensOnly, currency: "EUR" }).currency).toBe("EUR");
  });

  it("keeps a share of one exact: a single-image request stays provider-reported", () => {
    const one: Usage = { input: 5, output: 6, total: 11, cost: 0.0021, currency: "USD" };
    expect(allocateUsage(one, 1)).toEqual(one);
    expect(costInfoFor(MODEL, allocateUsage(one, 1)).basis).toBe("provider");
  });
});

describe("cost wording", () => {
  it("shows a reported number as reported and a calculated one as Estimated", () => {
    expect(costLabel({ actual: 0.0123, estimated: null, currency: "USD", pricing: PRICING_VERSION, basis: "provider" }))
      .toBe("$0.0123 reported");
    expect(costLabel({ actual: null, estimated: 0.01, currency: "USD", pricing: PRICING_VERSION, basis: "batch-split" }))
      .toBe("$0.0100 Estimated");
    expect(costLabel({ actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" }))
      .toBe("no cost reported");
    expect(costLabel({ actual: 0.01, estimated: null, currency: "EUR", pricing: PRICING_VERSION, basis: "provider" }))
      .toBe("0.0100 EUR reported");
  });

  it("formats a sum of reported and estimated numbers without mixing them", () => {
    expect(costText({ reported: 0.05, estimated: null })).toBe("$0.0500 reported");
    expect(costText({ reported: null, estimated: 0.03 })).toBe("$0.0300 Estimated");
    expect(costText({ reported: 0.05, estimated: 0.03 }))
      .toBe("$0.0500 reported · $0.0300 Estimated");
    expect(costText({ reported: null, estimated: null })).toBe("no cost reported");
    expect(NO_USAGE.cost).toBeNull();
  });

  it("keeps reported money and estimated money apart in the list totals", () => {
    const row = (over: Partial<SvgListRow>): SvgListRow => ({
      id: "x", name: "x.png", relPath: "x.png", generation: "generated", review: "pending",
      generatedAt: 1, cost: null, costEstimated: false, tokens: null, version: 1, ...over,
    });
    const totals = usageTotals([
      row({ id: "reported", cost: 0.05, tokens: 3000 }),
      row({ id: "estimated", cost: 0.03, costEstimated: true, tokens: 1000 }),
      row({ id: "unknown" }),
    ]);
    expect(totals.cost).toBe(0.05);
    expect(totals.estimated).toBe(0.03);
    expect(totals.tokens).toBe(4000);
    expect(costText({ reported: totals.cost, estimated: totals.estimated }))
      .toBe("$0.0500 reported · $0.0300 Estimated");
    const onlyEstimated = usageTotals([row({ cost: 0.03, costEstimated: true })]);
    expect(onlyEstimated.cost).toBeNull();
    expect(usageTotals([]).estimated).toBeNull();
  });

  it("notes how a number was obtained, so an estimate can be audited later", () => {
    const note = costNote(MODEL, { actual: null, estimated: 0.42, currency: "USD", pricing: PRICING_VERSION, basis: "rate-card" });
    expect(note).toContain(MODEL);
    expect(note).toContain("USD");
    expect(note).toContain(PRICING_VERSION);
    expect(note.toLowerCase()).toContain("rate card");
    expect(costNote(MODEL, { actual: 0.01, estimated: null, currency: "USD", pricing: "", basis: "provider" }).toLowerCase())
      .toContain("provider reported");
    expect(costNote(MODEL, { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" }).toLowerCase())
      .toContain("nothing");
  });
});
