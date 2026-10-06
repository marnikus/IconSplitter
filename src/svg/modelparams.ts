// modelparams.ts — resolving one model's settings (prompt §"persist settings
// per model" + §"reset incompatible values when model changes, with a clear
// warning"). Owns: turning a model id, an optional catalog and whatever was
// stored for that model into capabilities plus values that are safe to store and
// safe to send. Pure, so the tab's boot, its model switch and its manual refresh
// all go through exactly the same rule.

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  capsFor,
  sanitizeParams,
  type CatalogModel,
  type ModelCaps,
  type SamplingParams,
} from "../lib/modelcaps";
import { modelLabel } from "../lib/svgconfig";

export interface Resolved {
  caps: ModelCaps;
  params: SamplingParams;
  /** What had to change, in words — empty when nothing was incompatible. */
  reset: string[];
}

/**
 * First time on a model: its own defaults. A model that refuses temperature
 * starts without one instead of inheriting the previous model's value.
 */
export function defaultsFor(caps: ModelCaps): SamplingParams {
  return {
    temperature: caps.temperature === null ? null : DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    effort: null,
  };
}

export function resolveModelParams(model: string, catalog: CatalogModel[] | null, stored: SamplingParams | undefined): Resolved {
  const caps = capsFor(model, catalog);
  const { params, reset } = sanitizeParams(caps, stored ?? defaultsFor(caps));
  return { caps, params, reset };
}

/** The warning a model change shows, or null when nothing had to be reset. */
export function resetNote(model: string, reset: readonly string[]): string | null {
  return reset.length === 0 ? null : `${modelLabel(model)}: ${reset.join("; ")}`;
}
