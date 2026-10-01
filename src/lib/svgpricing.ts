// svgpricing.ts — what one generation cost (prompt §14/§16).
// Owns: the versioned rate card behind a calculated cost, the arithmetic that
// turns token counts into USD, and the ONE decision between a provider-reported
// number and a calculated one. A provider-reported number is never relabelled;
// a calculation is labelled Estimated and says which pricing version produced
// it; nothing is invented when the tokens or the rate are unknown.
//
// Rate card verified 2026-10-01 against
// https://www.requesty.ai/models/openai/gpt-6.1-sol
//   * openai/gpt-6.1-sol: $2.00 / 1M input, $10.00 / 1M output (provider rates)
//   * Requesty adds a flat 5% pay-as-you-go markup (0% with BYOK)
//   * prompt caching is NOT modelled, so an estimate can only be too high
// Bump PRICING_VERSION whenever RATE_CARD or PROVIDER_MARKUP changes.

import type { CostInfo } from "./svgfile";
import type { Usage } from "./svgrequest";

/** The pricing table version stored beside every cost. */
export const PRICING_VERSION = "requesty-2026-10-01";

/** Requesty's pay-as-you-go markup on provider rates (1 with BYOK). */
export const PROVIDER_MARKUP = 1.05;

/** Provider rates in USD per 1M tokens. */
export interface Rate {
  input: number;
  output: number;
}

export const RATE_CARD: Readonly<Record<string, Rate>> = {
  "openai/gpt-6.1-sol": { input: 2, output: 10 },
};

export function rateFor(model: string): Rate | null {
  return RATE_CARD[model] ?? null;
}

/** Needs BOTH counts: half a usage cannot be priced, and guessing is banned. */
export function estimateFromTokens(model: string, tokens: { input: number | null; output: number | null }): number | null {
  const rate = rateFor(model);
  if (rate === null || tokens.input === null || tokens.output === null) return null;
  return ((tokens.input * rate.input + tokens.output * rate.output) / 1_000_000) * PROVIDER_MARKUP;
}

/** The one place that decides where a version's cost comes from. */
/**
 * The calculated part of a whole run: null when nothing had to be estimated.
 * Reported money is never merged into it (svgusage keeps the two apart).
 */
export function sumEstimated(model: string, usages: readonly Usage[]): number | null {
  const parts = usages.map((u) => costInfoFor(model, u)).flatMap((c) => (c.estimated === null ? [] : [c.estimated]));
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
}

export function costInfoFor(model: string, usage: Usage): CostInfo {
  const base = { currency: usage.currency, pricing: PRICING_VERSION };
  if (usage.cost !== null) return { ...base, actual: usage.cost, estimated: null, basis: "provider" };
  if (usage.estimated !== undefined && usage.estimated !== null) {
    return { ...base, actual: null, estimated: usage.estimated, basis: "batch-split" };
  }
  const estimated = estimateFromTokens(model, usage);
  return estimated === null
    ? { ...base, actual: null, estimated: null, basis: "none" }
    : { ...base, actual: null, estimated, basis: "rate-card" };
}
