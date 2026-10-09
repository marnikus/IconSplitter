// regenprompt.ts — the text and image ONE request of a run carries (2026-10-09).
// Owns the choice between the two regeneration modes per request: the main
// prompt (every request that is not one regenerated icon) or the saved prompt
// + the icon's newest valid SVG code, read from its file, with the same image.
// The version record keeps the prompt text but never the code — the code is the
// previous version's own file. A code that cannot be read fails that icon;
// an icon with no valid SVG yet is a first generation and gets the main prompt.

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { currentSvgPrompt, type CurrentSvgPlan } from "../lib/svgregen";
import { newestValid } from "../lib/svgfile";
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

export async function requestTextOf(args: RunArgs, items: readonly SvgSource[], plan: BatchPlan): Promise<RequestTextResult> {
  const only = items.length === 1 ? items[0] : undefined;
  if (args.regen.kind === "current-svg" && only !== undefined) return regenTextOf(args, args.regen, only, plan);
  return { ok: true, text: mainTextOf(args.prompt, items, plan) };
}

function mainTextOf(prompt: string, items: readonly SvgSource[], plan: BatchPlan): RequestText {
  const text = items.length === 1 ? singlePrompt(prompt, items[0].stem) : batchPrompt(prompt, batchManifest(plan.items));
  return { prompt: text, record: prompt };
}

async function regenTextOf(args: RunArgs, regen: CurrentSvgPlan, item: SvgSource, plan: BatchPlan): Promise<RequestTextResult> {
  const current = newestValid(args.metas.get(item.id)?.versions ?? []);
  if (current === null) {
    log({ level: "warn", feature: "svg", action: "regen-no-svg", detail: `${item.name}: no valid SVG yet — sent with the main prompt` });
    return { ok: true, text: mainTextOf(args.prompt, [item], plan) };
  }
  const code = await readSvgText(args.root, current.svgPath);
  if (code === null) return { ok: false, error: `${item.name}: the current SVG could not be read — nothing was sent` };
  return {
    ok: true,
    text: {
      prompt: currentSvgPrompt(regen.presetText, item.stem, code),
      record: singlePrompt(regen.presetText, item.stem),
    },
  };
}
