// confirmplan.ts — the ONE plan the popup shows and the queue runs (RUN-1).
// Extracted from SvgConfirm (RULE 18) when batch regeneration arrived: the plan
// now depends on the frozen codes and on the batch's own prompt choice, and the
// refusal list has to name an excluded icon instead of guessing.

import { useMemo, useState } from "react";
import { planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { inIdOrder } from "../lib/selectionorder";
import { clampImagesPerRequest, type SvgConfig } from "../lib/svgconfig";
import { clampRegenPerRequest, regenPromptProblem, type RegenCodeItem, type RegenPlan } from "../lib/svgregen";
import type { ResolvedTaskPrompt } from "../lib/prompttasks";
import type { BuiltComposite } from "./composite";
import type { RegenCodesState } from "./confirmcodes";
import { toBatchSource } from "./sources";
import type { SvgOperation, SvgRow } from "./types";

export interface ConfirmPlanInput {
  ids: string[];
  operation: SvgOperation;
  rows: SvgRow[];
  config: SvgConfig;
  /** The prompt the BATCH uses (its own task, never the other tab's). */
  choice: ResolvedTaskPrompt;
  codes: RegenCodesState;
}

export interface ConfirmPlan {
  /** Everything selected, in pick order — including an excluded row. */
  picked: SvgRow[];
  /** The rows the requests are built from (a regeneration drops unreadable ones). */
  eligible: SvgRow[];
  /** Names of the rows left out, with the reason the note shows. */
  excluded: string[];
  perRequest: number;
  plans: BatchPlan[];
  problems: string[];
  page: number;
  cache: Map<string, BuiltComposite>;
  active: BatchPlan | null;
  setPage: (page: number) => void;
  /** The regeneration plan this batch would be queued with; null for a generation. */
  regen: RegenPlan | null;
}

export function useConfirmPlan(input: ConfirmPlanInput): ConfirmPlan {
  const { ids, operation, rows, codes, choice } = input;
  const picked = useMemo(() => inIdOrder(rows, ids, (r) => r.source.id), [rows, ids]);
  const eligible = useMemo(
    () => (operation === "regenerate" ? picked.filter((r) => codes.codes.has(r.source.id)) : picked),
    [operation, picked, codes],
  );
  const excluded = useMemo(
    () => (operation === "regenerate" ? picked.filter((r) => !codes.codes.has(r.source.id)).map((r) => r.source.name) : []),
    [operation, picked, codes],
  );
  // ONE setting sizes both modes: the connection's "Images / request", clamped
  // to the regeneration range (2026-10-20 — the popup has no count of its own).
  const perRequest = useMemo(
    () => (operation === "regenerate"
      ? clampRegenPerRequest(input.config.imagesPerRequest)
      : clampImagesPerRequest(input.config.imagesPerRequest)),
    [operation, input.config.imagesPerRequest],
  );
  const plans = useMemo(() => planBatches(eligible.map((r) => toBatchSource(r.source)), perRequest), [eligible, perRequest]);
  const problems = useMemo(
    () => problemsOf({ input, eligible, plans, perRequest }),
    [input, eligible, plans, perRequest],
  );
  const [page, setPage] = useState(0);
  const cache = useMemo(() => new Map<string, BuiltComposite>(), []);
  const active = plans[Math.min(page, Math.max(0, plans.length - 1))] ?? null;
  const regen = useMemo(() => regenOf(operation, choice, perRequest), [operation, choice, perRequest]);
  return { picked, eligible, excluded, perRequest, plans, problems, page, cache, active, setPage, regen };
}

interface ProblemInput extends Pick<ConfirmPlanInput, "operation" | "choice"> {
  codes: RegenCodesState;
}

interface ProblemCtx {
  input: ProblemInput;
  eligible: SvgRow[];
  plans: BatchPlan[];
  perRequest: number;
}

/** Every reason this batch cannot be sent, in the order the popup explains them. */
function problemsOf(ctx: ProblemCtx): string[] {
  const base = validateBatchPlan(ctx.plans, ctx.perRequest);
  if (base.length > 0) return base;
  if (ctx.input.choice.problem !== null) return [ctx.input.choice.problem];
  if (ctx.input.operation !== "regenerate") return [];
  if (ctx.input.codes.loading) return ["Reading the current SVG code…"];
  if (ctx.eligible.length === 0) {
    return ["No selected icon has a readable current SVG — use Generate selected for a first version"];
  }
  return planTextProblems(ctx);
}

/** The prompt ceiling is checked per REQUEST, not per batch: one slow page at a time. */
function planTextProblems(ctx: ProblemCtx): string[] {
  const items = ctx.input.codes.codes;
  const text = ctx.input.choice.choice.kind === "preset" ? ctx.input.choice.choice.text : "";
  for (const plan of ctx.plans) {
    const codes = plan.items.flatMap((item) => codedItem(items.get(item.sourceId), item.position, item.name));
    const why = regenPromptProblem(text, codes);
    if (why !== null) return [why];
  }
  return [];
}

function codedItem(code: { code: string | null } | undefined, position: number, name: string): RegenCodeItem[] {
  if (code === undefined || code.code === null) return [];
  return [{ position, name, code: code.code }];
}

function regenOf(operation: SvgOperation, choice: ResolvedTaskPrompt, size: number): RegenPlan | null {
  if (operation !== "regenerate" || choice.choice.kind !== "preset") return null;
  return { kind: "current-svg", presetName: choice.choice.name, presetText: choice.choice.text, size };
}
