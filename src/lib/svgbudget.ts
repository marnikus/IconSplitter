// svgbudget.ts — derive a request budget from explicit effort/settings (RULE 3).
// Owns the completion ceiling, conservative per-request image cap and app deadline.
// The caps reflect the reported 4/2/1 safe counts; they are not provider quotas.

import { IMAGES_PER_REQUEST_MAX, TIMEOUT_CEILING_MS } from "./svgconfig";
import type { Effort } from "./modelcaps";

export { TIMEOUT_CEILING_MS };

/** A provisional multiplier until live per-tier timing/token samples exist. */
export const REASONING_WEIGHT: Record<Effort, number> = {
  low: 1,
  medium: 2,
  high: 4,
  xhigh: 8,
};

/** Reported maximum images per request, independent of the provider's quota. */
export const OBSERVED_IMAGES_PER_REQUEST: Record<Effort, number> = {
  low: 4,
  medium: 2,
  high: 1,
  xhigh: 1,
};

/** An unset effort is the provider's own default — no specific tier cap is assumed. */
export function weightOf(effort: Effort | null): number {
  return effort === null ? 1 : REASONING_WEIGHT[effort];
}

/** Seconds one image of one batch is allowed, at the configured base budget. */
function perImageMs(effort: Effort | null, base: number): number {
  return (base * weightOf(effort)) / 2;
}

/** Completion ceiling scales provisionally with effort and is clamped to model caps. */
export function maxTokensFor(effort: Effort | null, base: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(base, base * weightOf(effort)));
}

/** Total app deadline: scale by effort and batch size, then respect the safety ceiling. */
export function timeoutMsFor(effort: Effort | null, images: number, base: number, ceiling: number = TIMEOUT_CEILING_MS): number {
  const batch = perImageMs(effort, base) * Math.max(1, images);
  return Math.min(ceiling, Math.max(base, batch));
}

/** The smallest of configured count, observed tier cap, grid maximum and app-deadline fit. */
export function imagesPerRequestFor(effort: Effort | null, wanted: number, base: number, ceiling: number = TIMEOUT_CEILING_MS): number {
  const fits = Math.floor(ceiling / perImageMs(effort, base));
  const observed = effort === null ? IMAGES_PER_REQUEST_MAX : OBSERVED_IMAGES_PER_REQUEST[effort];
  return Math.max(1, Math.min(wanted, fits, IMAGES_PER_REQUEST_MAX, observed));
}

/** The budget a run plans and sends with — everything the runner needs. */
export interface RequestBudget {
  effort: Effort | null;
  /** Images one request may carry at this effort. */
  imagesPerRequest: number;
  /** Completion ceiling to send, reasoning room included. */
  maxTokens: number;
  /** The user's own per-request timeout, before the batch scaling. */
  timeoutMs: number;
}

export interface BudgetOpts {
  /** The user's images/request setting. */
  images: number;
  /** The user's output-token ceiling. */
  maxTokens: number;
  /** The user's per-request timeout. */
  timeoutMs: number;
  /** The most the selected model accepts. */
  tokenCeiling: number;
}

/** Planning-time budget: the batch size and token ceiling, straight from settings. */
export function requestBudgetFor(effort: Effort | null, opts: BudgetOpts): RequestBudget {
  return {
    effort,
    imagesPerRequest: imagesPerRequestFor(effort, opts.images, opts.timeoutMs),
    maxTokens: maxTokensFor(effort, opts.maxTokens, opts.tokenCeiling),
    timeoutMs: opts.timeoutMs,
  };
}

/** The same budget with the timeout a FULL batch is allowed, for the UI. */
export function budgetFor(effort: Effort | null, opts: BudgetOpts): RequestBudget {
  const budget = requestBudgetFor(effort, opts);
  return { ...budget, timeoutMs: timeoutMsFor(effort, budget.imagesPerRequest, opts.timeoutMs) };
}
