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
// Image model added 2026-10-19 (user report: an image regeneration showed
// tokens but "no cost reported" — the image endpoint reports no cost), verified
// against https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst:
//   * openai/gpt-image-2.5-sunburst: text input $5, image input $8, image output
//     $30 / 1M. The usage gives one input count, so all of it is priced at the
//     image-input rate: like caching, the estimate can only be too high.
// Bump PRICING_VERSION whenever RATE_CARD or PROVIDER_MARKUP changes.

import type { CostInfo } from "./svgfile";
import type { Usage } from "./svgrequest";

/** The pricing table version stored beside every cost. */
export const PRICING_VERSION = "requesty-2026-10-19";

/** Requesty's pay-as-you-go markup on provider rates (1 with BYOK). */
export const PROVIDER_MARKUP = 1.05;

/** Provider rates in USD per 1M tokens. */
export interface Rate {
  input: number;
  output: number;
}

export const RATE_CARD: Readonly<Record<string, Rate>> = {
  "openai/gpt-6.1-sol": { input: 2, output: 10 },
  "openai/gpt-image-2.5-sunburst": { input: 8, output: 30 },
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
