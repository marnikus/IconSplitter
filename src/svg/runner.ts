// runner.ts — the batched generation run (prompt §2/§4/§8/§17).
// Owns: turning the selection into batches at the size the selected reasoning
// level allows, validating that plan before a single byte leaves, handing each
// batch to runbatch.ts, and folding the per-request outcomes into one summary.
// It never overwrites an existing version, never retries a request whose
// outcome is unknown, and never guesses a mapping — an unmatched or duplicate
// result is reported.

import { planBatches, validateBatchPlan, type BatchSource } from "../lib/svgbatch";
import { effectivePerRequest, effectiveTimeoutMs } from "../lib/effortlimits";
import { costInfoFor } from "../lib/svgpricing";
import { sumUsage } from "../lib/svgusage";
import type { Usage } from "../lib/svgrequest";
import { toBatchSource, type SvgSource } from "./sources";
import { runBatch } from "./runbatch";

export { message } from "./runbatch";
import type { RunArgs, RunState, RunSummary } from "./runtypes";

export type { RunArgs, RunEvent, RunSummary } from "./runtypes";

export async function runGeneration(args: RunArgs): Promise<RunSummary> {
  const perRequest = effectivePerRequest(args.config.imagesPerRequest, args.caps, args.params);
  const plans = planBatches(toBatchSources(args.sources), perRequest);
  const state = newRunState(args, plans.length, perRequest);
  const problems = validateBatchPlan(plans, perRequest);
  if (problems.length > 0) return failPlan(state, problems);
  args.onEvent({ kind: "run-start", batches: plans.length, perRequest });
  for (const [i, plan] of plans.entries()) {
    if (args.signal.aborted) {
      args.onEvent({ kind: "cancelled" });
      break;
    }
    await runBatch(state, plan, i + 1);
  }
  return summaryOf(state, args.signal.aborted);
}

function newRunState(args: RunArgs, total: number, perRequest: number): RunState {
  const timeoutMs = effectiveTimeoutMs(args.config.timeoutMs, args.caps, args.params);
  return { args, total, perRequest, timeoutMs, saved: 0, failed: 0, missing: 0, invalid: 0, usages: [], outcomes: [], problems: [] };
}

function summaryOf(state: RunState, cancelled: boolean): RunSummary {
  return {
    perRequest: state.perRequest, batches: state.total, saved: state.saved, failed: state.failed,
    missing: state.missing, invalid: state.invalid, cancelled,
    usage: sumUsage(state.usages), estimated: sumEstimated(state.args.config.model, state.usages),
    problems: state.problems, outcomes: state.outcomes,
  };
}

/** An unusable plan is a bug, not a request: nothing is sent and it is said why. */
function failPlan(state: RunState, problems: readonly string[]): RunSummary {
  state.problems.push(...problems);
  for (const source of state.args.sources) {
    state.failed += 1;
    state.args.onEvent({
      kind: "item-failed", batchId: "invalid-plan", position: 0, sourceId: source.id,
      error: problems[0], failure: "payload", retryAfterMs: null,
    });
  }
  return summaryOf(state, false);
}

/** The calculated part of a run's cost: null when nothing had to be estimated. */
function sumEstimated(model: string, usages: readonly Usage[]): number | null {
  const parts = usages.map((u) => costInfoFor(model, u)).flatMap((c) => (c.estimated === null ? [] : [c.estimated]));
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
}

/** Selection order is the batch order: the scan's deterministic order. */
function toBatchSources(sources: readonly SvgSource[]): BatchSource[] {
  return sources.map(toBatchSource);
}

