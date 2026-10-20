// regenprompt.ts — the text ONE request of a run carries.
// Supports first-generation prompts (single / batch) AND current-SVG regeneration
// for both single icons (1) and multi-icon batches (2..9). Version lookup always
// reads chosenVersion(versions, preferred) so previewed and sent SVGs match (I-54).

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { batchRegenPrompt, currentSvgPrompt, type CurrentSvgPlan, type RegenBatchEntry } from "../lib/svgregen";
import { chosenVersion } from "../lib/svgfile";
import { log } from "../log/logstore";
import { readSvgText } from "./svgfiles";
import type { RunArgs } from "./runtypes";
import type { SvgSource } from "./sources";

/** `prompt` is sent; `record` is what the pair file keeps as this version's prompt. */
export interface RequestText {
  prompt: string;
  record: string;
}

export type RequestTextResult = { ok: true; text: RequestText } | { ok: false; error: string };

export async function requestTextOf(
  args: RunArgs, items: readonly SvgSource[], plan: BatchPlan,
): Promise<RequestTextResult> {
  if (args.regen.kind !== "current-svg") {
    return { ok: true, text: mainTextOf(args.prompt, items, plan) };
  }
  if (items.length === 1) {
    return regenSingleTextOf(args, args.regen, items[0], plan);
  }
  return regenBatchTextOf(args, args.regen, items, plan);
}

function mainTextOf(prompt: string, items: readonly SvgSource[], plan: BatchPlan): RequestText {
  const planName = plan.items[0]?.name ?? items[0]?.stem ?? "";
  const text = items.length === 1
    ? singlePrompt(prompt, planName)
    : batchPrompt(prompt, batchManifest(plan.items));
  return { prompt: text, record: prompt };
}

function currentVersionOf(args: RunArgs, item: SvgSource) {
  const meta = args.metas.get(item.id);
  return chosenVersion(meta?.versions ?? [], meta?.preferred ?? null);
}

async function regenSingleTextOf(
  args: RunArgs, regen: CurrentSvgPlan, item: SvgSource, plan: BatchPlan,
): Promise<RequestTextResult> {
  const current = currentVersionOf(args, item);
  if (current === null) {
    log({ level: "warn", feature: "svg", action: "regen-no-svg", detail: `${item.name}: no valid SVG yet — sent with the main prompt` });
    return { ok: true, text: mainTextOf(args.prompt, [item], plan) };
  }
  const code = await readSvgText(args.root, current.svgPath);
  if (code === null) return { ok: false, error: `${item.name}: the current SVG could not be read — nothing was sent` };
  const targetName = plan.items[0]?.name ?? item.stem;
  return {
    ok: true,
    text: {
      prompt: currentSvgPrompt(regen.presetText, targetName, code),
      record: singlePrompt(regen.presetText, targetName),
    },
  };
}

async function regenBatchTextOf(
  args: RunArgs, regen: CurrentSvgPlan, items: readonly SvgSource[], plan: BatchPlan,
): Promise<RequestTextResult> {
  const entries: RegenBatchEntry[] = [];
  for (const item of items) {
    const current = currentVersionOf(args, item);
    if (current === null) return { ok: false, error: `${item.name}: the current SVG could not be read — nothing was sent` };
    const code = await readSvgText(args.root, current.svgPath);
    if (code === null) return { ok: false, error: `${item.name}: the current SVG could not be read — nothing was sent` };
    const slot = plan.items.find((p) => p.sourceId === item.id);
    entries.push({ position: slot?.position ?? entries.length + 1, name: slot?.name ?? item.stem, code });
  }
  return {
    ok: true,
    text: { prompt: batchRegenPrompt(regen.presetText, entries), record: regen.presetText },
  };
}
