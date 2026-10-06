// paramstore.ts — per-model sampling settings (prompt §"persist settings per
// model"; RULE 6/13). Owns: the localStorage payload that keeps one entry per
// model id, so switching models does not lose a tuned setting and a hand-edited
// payload costs one ignored load, not a broken tab. Whether a stored value is
// still valid for its model is decided by lib/modelcaps, never here.

import { isRecord } from "../lib/isrecord";
import type { SamplingParams } from "../lib/modelcaps";

const KEY = "iconSplitter.svg.modelParams.v1";

/** model id -> the settings that were saved for it. */
export type ParamMap = Record<string, SamplingParams>;

export function loadParamMap(): ParamMap {
  const text = localStorage.getItem(KEY);
  if (!text) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !isRecord(raw.byModel)) return {};
    const out: ParamMap = {};
    for (const [model, value] of Object.entries(raw.byModel)) {
      if (isRecord(value)) out[model] = value as unknown as SamplingParams;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveParamMap(map: ParamMap): void {
  localStorage.setItem(KEY, JSON.stringify({ v: 1, byModel: map }));
}

/** What was stored for one model, or undefined when it was never saved. */
export function paramsFor(map: ParamMap, model: string): SamplingParams | undefined {
  return map[model];
}

/** A new map with one model's settings replaced — the caller's map is untouched. */
export function withParams(map: ParamMap, model: string, params: SamplingParams): ParamMap {
  return { ...map, [model]: params };
}
