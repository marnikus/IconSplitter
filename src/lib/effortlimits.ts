// effortlimits.ts — what the selected reasoning level allows one request to do.
// Owns: the documented icon cap and timeout floor per effort tier, the three
// effective values every surface reads (cap, wait, note) and the honest
// wording for both. One owner per decision: no other module may cap a batch or
// raise a wait, so the confirmation, the runner and the controls can never
// disagree about how many requests a selection becomes.
//
// Timeout floors verified 2026-10-01 against the latency guidance for hosted
// OpenAI-compatible reasoning models (a request that thinks before answering
// needs 120 s+ at low effort, ~300 s at medium and up to 900 s at high; high
// effort answers take minutes). The icon cap follows the same direction: more
// icons per request means more output tokens and more time, so the batch
// shrinks as the effort rises. Sources recorded in
// docs/archive/2026-10-01-svg-batches-limits-preview/design.md.

import { IMAGES_PER_REQUEST_MAX, clampImagesPerRequest } from "./svgconfig";
import { effortOf, type Effort, type ModelCaps, type SamplingParams } from "./modelcaps";

export interface EffortRule {
  /** Icons one request may carry at this effort. */
  icons: number;
  /** Documented minimum wait for an answer at this effort (ms). */
  timeoutMs: number;
}

export const EFFORT_RULES: Readonly<Record<Effort, EffortRule>> = {
  low: { icons: IMAGES_PER_REQUEST_MAX, timeoutMs: 120_000 },
  medium: { icons: 2, timeoutMs: 300_000 },
  high: { icons: 1, timeoutMs: 600_000 },
  xhigh: { icons: 1, timeoutMs: 600_000 },
};

/** The rule in force, or null when no effort is sent (the provider's own default). */
export function effortRule(caps: ModelCaps, params: SamplingParams): EffortRule | null {
  const effort = effortOf(caps, params.effort);
  return effort === null ? null : EFFORT_RULES[effort];
}

/** Icons per request: never more than configured, never more than the tier allows. */
export function effectivePerRequest(configured: number, caps: ModelCaps, params: SamplingParams): number {
  const rule = effortRule(caps, params);
  const wanted = clampImagesPerRequest(configured);
  return rule === null ? wanted : Math.min(wanted, rule.icons);
}

/** The wait really used: the configured timeout, raised to the tier's floor. */
export function effectiveTimeoutMs(configured: number, caps: ModelCaps, params: SamplingParams): number {
  const rule = effortRule(caps, params);
  return rule === null ? configured : Math.max(configured, rule.timeoutMs);
}

/** What the tier changed about the configured size; null when nothing was capped. */
export function limitNote(configured: number, caps: ModelCaps, params: SamplingParams): string | null {
  const effort = effortOf(caps, params.effort);
  const wanted = clampImagesPerRequest(configured);
  if (effort === null || EFFORT_RULES[effort].icons >= wanted) return null;
  const icons = EFFORT_RULES[effort].icons;
  return `reasoning effort ${effort} allows ${icons} icon${icons === 1 ? "" : "s"} per request `
    + `(configured ${wanted}) — the selection is split automatically`;
}

/** "600s (high floor)" when the tier raised the wait, otherwise "90s". */
export function timeoutLabel(configured: number, caps: ModelCaps, params: SamplingParams): string {
  const raised = effectiveTimeoutMs(configured, caps, params);
  if (raised <= configured) return `${Math.round(configured / 1000)}s`;
  return `${Math.round(raised / 1000)}s (${effortOf(caps, params.effort)} floor)`;
}

/** Why a wait ended and what can change it — never a bare "request timed out". */
export function timeoutHint(caps: ModelCaps, params: SamplingParams, waitedMs: number): string {
  const seconds = Math.round(waitedMs / 1000);
  const effort = effortOf(caps, params.effort);
  const tier = effort === null ? "" : ` at effort ${effort}`;
  const fix = effort === null || effort === "low"
    ? "raise the timeout in the model card"
    : "lower the reasoning effort or raise the timeout";
  return `request timed out after ${seconds}s${tier} — the provider did not answer; ${fix}. Nothing was resent.`;
}
