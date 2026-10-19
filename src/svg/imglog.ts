// imglog.ts — the global log vocabulary of AI source regeneration (2026-10-19,
// user report: the log did not say what a regeneration cost or how many tokens
// it spent). One entry per source plus one run summary, both built from the
// provider-reported usage the runner returns. The cost decision is the SVG
// side's (costInfoFor / costLabel): reported stays reported, a calculation says
// Estimated, nothing reported says so — never an invented number.

import type { LogSpec } from "../lib/log";
import { costInfoFor } from "../lib/svgpricing";
import { NO_USAGE, type Usage } from "../lib/svgrequest";
import { costLabel, fmtTokens, sumUsage } from "../lib/svgusage";
import type { ImageRegenResult } from "./imgrunner";

const FEATURE = "svg";

/** What landed on disk after the run (a done request whose write failed is not done). */
export interface ImageTally { done: number; failed: number }

/** "1,000 in · 4,000 out · 5,000 tokens · $0.1200 reported". */
function spendOf(model: string, u: Usage): string {
  return `${fmtTokens(u.input)} in · ${fmtTokens(u.output)} out · ${fmtTokens(u.total)} tokens · ${costLabel(costInfoFor(model, u))}`;
}

/** The numbers every entry's data carries, so the log export can be summed. */
function spendData(model: string, u: Usage): Record<string, unknown> {
  const cost = costInfoFor(model, u);
  return { tokensIn: u.input, tokensOut: u.output, tokens: u.total, cost: cost.actual, estimated: cost.estimated, currency: u.currency, model };
}

const totalOf = (results: readonly ImageRegenResult[]): Usage => sumUsage(results.map((r) => r.usage ?? NO_USAGE));

/** The run's whole spend as one line (log summary and toast share it). */
export function imageSpendLine(results: readonly ImageRegenResult[], model: string): string {
  return spendOf(model, totalOf(results));
}

/** One source's request: its outcome and what it spent. */
export function imageItemSpec(result: ImageRegenResult, model: string): LogSpec {
  const u = result.usage ?? NO_USAGE;
  const failed = result.status === "failed";
  return {
    level: failed ? "error" : "info", feature: FEATURE, action: "image-regen-item",
    ids: { source: result.id, ...(result.requestId ? { request: result.requestId } : {}) },
    detail: failed ? `${result.error ?? "failed"} · ${spendOf(model, u)}` : `regenerated — ${spendOf(model, u)}`,
    data: { status: result.status, ...spendData(model, u) },
  };
}

/** The run summary: counts plus the summed spend of every request. */
export function imageRunSpec(results: readonly ImageRegenResult[], model: string, tally: ImageTally): LogSpec {
  const u = totalOf(results);
  return {
    level: tally.done === 0 ? "error" : tally.failed > 0 ? "warn" : "info",
    feature: FEATURE, action: "image-regen",
    detail: `${tally.done} done, ${tally.failed} failed · ${spendOf(model, u)}`,
    data: { ...tally, ...spendData(model, u) },
  };
}
