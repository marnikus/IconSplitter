// regenprompt.ts — the text and image ONE request of a run carries (2026-10-09,
// batch regeneration 2026-10-20). Owns the choice between the two modes per
// request: the batch's own prompt (the stored main prompt or a saved preset's
// text), or the saved prompt + the current SVG code of EVERY icon the request
// carries, all frozen when the batch was confirmed. The version record keeps
// the prompt text and its position, never another icon's code — the code is the
// previous version's own file. A code that is not in the frozen map fails that
// request; there is no silent main-prompt fallback any more.

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { choiceText, type PromptChoice } from "../lib/prompttasks";
import {
  regenBatchPrompt, regenPromptProblem, regenRecordText, type RegenCodeItem,
} from "../lib/svgregen";
import type { RunArgs } from "./runtypes";
import type { SvgSource } from "./sources";

/** `prompt` is sent; `record` is what the pair file keeps when no per-icon one exists. */
export interface RequestText {
  prompt: string;
  record: string;
  /** One record per source, so a batch member names its own position (I-76). */
  records: Map<string, string>;
}

export type RequestTextResult = { ok: true; text: RequestText } | { ok: false; error: string };

export async function requestTextOf(args: RunArgs, items: readonly SvgSource[], plan: BatchPlan): Promise<RequestTextResult> {
  if (args.regen.kind === "current-svg") return regenTextOf(args, items, plan);
  const prompt = choiceText(args.promptChoice ?? { kind: "main" }, args.prompt);
  return { ok: true, text: mainTextOf(prompt, items, plan) };
}

function mainTextOf(prompt: string, items: readonly SvgSource[], plan: BatchPlan): RequestText {
  const text = items.length === 1 ? singlePrompt(prompt, items[0].stem) : batchPrompt(prompt, batchManifest(plan.items));
  return { prompt: text, record: prompt, records: new Map() };
}

/** Every carried icon's code, in manifest order, or the named reason nothing is sent. */
interface Carry {
  codes: RegenCodeItem[];
  /** The source id of each code, same index — the record of a batch member. */
  ids: string[];
}

function codesOf(args: RunArgs, items: readonly SvgSource[], plan: BatchPlan): Carry | string {
  const codes: RegenCodeItem[] = [];
  const ids: string[] = [];
  for (const item of items) {
    const code = args.regenCodes?.get(item.id);
    if (code === undefined || code.code === null) return `${item.name}: its current SVG could not be read — nothing was sent`;
    codes.push({ position: positionOf(plan, item.id, codes.length + 1), name: item.stem, code: code.code });
    ids.push(item.id);
  }
  return { codes, ids };
}

function positionOf(plan: BatchPlan, sourceId: string, fallback: number): number {
  return plan.items.find((i) => i.sourceId === sourceId)?.position ?? fallback;
}

function regenTextOf(args: RunArgs, items: readonly SvgSource[], plan: BatchPlan): RequestTextResult {
  if (args.regen.kind !== "current-svg") return { ok: false, error: "no regeneration plan — nothing was sent" };
  const carry = codesOf(args, items, plan);
  if (typeof carry === "string") return { ok: false, error: carry };
  const { presetText } = args.regen;
  const why = regenPromptProblem(presetText, carry.codes);
  if (why !== null) return { ok: false, error: why };
  const records = new Map(carry.codes.map((c, i) => [carry.ids[i], regenRecordText(presetText, carry.codes.length, c.position)]));
  return {
    ok: true,
    text: {
      prompt: regenBatchPrompt(presetText, carry.codes),
      record: regenRecordText(presetText, carry.codes.length, carry.codes[0].position),
      records,
    },
  };
}

/** Re-exported for the confirmation preview: the same choice every reader makes. */
export type { PromptChoice };
