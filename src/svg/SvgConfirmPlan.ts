// SvgConfirmPlan.ts — batch planning, regeneration count validation, and paging
// state for SvgConfirm, kept separate so SvgConfirm stays compact (RULE 18).

import { useMemo, useState } from "react";
import { planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { inIdOrder } from "../lib/selectionorder";
import { clampImagesPerRequest, type SvgConfig } from "../lib/svgconfig";
import type { PromptPreset } from "../lib/promptpresets";
import { regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { scopeOfTask, type PromptScope } from "../lib/taskprompts";
import type { BuiltComposite } from "./composite";
import { loadRegenBatchPref, MAX_REGEN_BATCH, saveRegenBatchPref } from "./regenprefs";
import { toBatchSourcesUnique } from "./sources";
import type { SvgOperation, SvgRow } from "./types";

export interface ConfirmPlanInput {
  readonly ids: string[];
  readonly operation: SvgOperation;
  readonly rows: SvgRow[];
  readonly config: SvgConfig;
  readonly presets: PromptPreset[];
}

export interface ConfirmBatchCountState {
  readonly countText: string;
  readonly perRequest: number;
  readonly countError: string | null;
  readonly storageWarning: boolean;
  readonly scope: PromptScope;
  readonly setCountText: (text: string) => void;
}

export interface ConfirmPlan {
  readonly picked: SvgRow[];
  readonly perRequest: number;
  readonly plans: BatchPlan[];
  readonly problems: string[];
  readonly page: number;
  readonly cache: Map<string, BuiltComposite>;
  readonly active: BatchPlan | null;
  readonly setPage: (page: number) => void;
  readonly regen: RegenPlan | null;
}

function regenCountErrorOf(operation: SvgOperation, text: string): string | null {
  if (operation !== "regenerate") return null;
  const n = Number(text);
  if (text.trim() === "" || !Number.isInteger(n) || n < 1 || n > MAX_REGEN_BATCH) {
    return `Choose a whole number from 1 to ${MAX_REGEN_BATCH}`;
  }
  return null;
}

export function useConfirmBatchCount(input: ConfirmPlanInput, resetPage: () => void): ConfirmBatchCountState {
  const [stored] = useState(loadRegenBatchPref);
  const [countText, setRawText] = useState(() => String(stored.count));
  const countError = regenCountErrorOf(input.operation, countText);
  const perRequest = input.operation === "regenerate"
    ? clampImagesPerRequest(countError ? stored.count : Number(countText))
    : clampImagesPerRequest(input.config.imagesPerRequest);
  const scope = scopeOfTask(input.ids.length, perRequest, true);
  const setCountText = (text: string) => {
    setRawText(text);
    resetPage();
    const n = Number(text);
    if (text.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_REGEN_BATCH) {
      saveRegenBatchPref(n);
    }
  };
  return { countText, perRequest, countError, storageWarning: stored.warning, scope, setCountText };
}

function buildRegenPlan(
  operation: SvgOperation, selected: string, presets: PromptPreset[], perRequest: number,
): RegenPlan | null {
  if (operation !== "regenerate" || presets.length === 0) return null;
  const res = regenPlanFromPresetName(selected, presets, perRequest);
  return res.ok ? res.plan : null;
}

function collectProblems(args: {
  plans: BatchPlan[]; perRequest: number; input: ConfirmPlanInput; selected: string; countError: string | null;
}): string[] {
  const { plans, perRequest, input, selected, countError } = args;
  if (countError !== null) return [countError];
  const base = validateBatchPlan(plans, perRequest);
  if (base.length > 0) return base;
  if (input.operation !== "regenerate") return [];
  if (input.presets.length === 0) return ["No saved prompts — save one in the prompt window first"];
  const res = regenPlanFromPresetName(selected, input.presets, perRequest);
  return res.ok ? [] : [res.problem];
}

export interface BuildPlanArgs {
  readonly input: ConfirmPlanInput;
  readonly selected: string;
  readonly perRequest: number;
  readonly countError: string | null;
  readonly page: number;
  readonly setPage: (page: number) => void;
}

export function useBuiltConfirmPlan(args: BuildPlanArgs): ConfirmPlan {
  const { input, selected, perRequest, countError, page, setPage } = args;
  const picked = useMemo(() => inIdOrder(input.rows, input.ids, (r) => r.source.id), [input.rows, input.ids]);
  const regen = useMemo(
    () => buildRegenPlan(input.operation, selected, input.presets, perRequest),
    [input.operation, selected, input.presets, perRequest],
  );
  const plans = useMemo(
    () => planBatches(toBatchSourcesUnique(picked.map((r) => r.source)), perRequest),
    [picked, perRequest],
  );
  const problems = useMemo(
    () => collectProblems({ plans, perRequest, input, selected, countError }),
    [plans, perRequest, input, selected, countError],
  );
  const cache = useMemo(() => new Map<string, BuiltComposite>(), []);
  const active = plans[Math.min(page, Math.max(0, plans.length - 1))] ?? null;
  return { picked, perRequest, plans, problems, page, cache, active, setPage, regen };
}
