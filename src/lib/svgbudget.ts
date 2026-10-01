// svgbudget.ts — how much to ask for, given how hard the model is asked to
// think (RULE 3). Owns the effort weights and the three numbers one request
// needs: the completion ceiling, the timeout, and the images a composite may
// carry. Pure: no clock, no fetch, no stored config — the caller passes the
// numbers it already has.
//
// Why it exists (docs/archive/2026-10-02-effort-request-budget): a reasoning
// model spends its completion ceiling on the thinking AND on the answer, and
// takes longer the harder it thinks. A flat 32 000-token / 90-second budget
// therefore cut 3–4-icon answers short at medium effort and allowed one icon
// per run at high. The budget is derived from the effort and shown in the UI,
// so nothing about it is silent.

import { IMAGES_PER_REQUEST_MAX, TIMEOUT_CEILING_MS } from "./svgconfig";
import type { Effort } from "./modelcaps";

export { TIMEOUT_CEILING_MS };

/**
 * Hidden reasoning each tier adds, relative to the provider's own default.
 * Calibrated on the reported behaviour (4 icons fit the 90 s budget at `low`,
 * 2 at `medium`, 1 at `high`) and then doubled, so every tier has head-room
 * over the slowest answer a user actually saw.
 */
export const REASONING_WEIGHT: Record<Effort, number> = {
  low: 1,
  medium: 2,
  high: 4,
  xhigh: 8,
};

/** An unset effort is the provider's own default — no extra room, no extra time. */
export function weightOf(effort: Effort | null): number {
  return effort === null ? 1 : REASONING_WEIGHT[effort];
}

/** Seconds one image of one batch is allowed, at the configured base budget. */
function perImageMs(effort: Effort | null, base: number): number {
  return (base * weightOf(effort)) / 2;
}

/**
 * Completion ceiling to send: the user's own budget plus the room the chosen
 * effort will spend inside the same ceiling. Never above the model's maximum,
 * never below the value the user asked for.
 */
export function maxTokensFor(effort: Effort | null, base: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(base, base * weightOf(effort)));
}

/**
 * How long one composite request may take: the per-image budget times the
 * images in the batch, never shorter than the user's own timeout and never
 * longer than the provider's gateway limit.
 */
export function timeoutMsFor(effort: Effort | null, images: number, base: number, ceiling: number = TIMEOUT_CEILING_MS): number {
  const batch = perImageMs(effort, base) * Math.max(1, images);
  return Math.min(ceiling, Math.max(base, batch));
}

/**
 * The largest batch whose derived timeout still fits the gateway limit — a
 * batch that cannot finish is never sent. Then the user's own setting, then the
 * documented 1..9 grid.
 */
export function imagesPerRequestFor(effort: Effort | null, wanted: number, base: number, ceiling: number = TIMEOUT_CEILING_MS): number {
  const fits = Math.floor(ceiling / perImageMs(effort, base));
  return Math.max(1, Math.min(wanted, fits, IMAGES_PER_REQUEST_MAX));
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

/** Planning-time budget: the batch size and the ceiling, straight from settings. */
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
