// modelcaps.ts — what the selected model actually accepts (RULE 3/13).
// Owns: the sampling-parameter vocabulary (temperature, output-token ceiling,
// reasoning effort), the capability rules per model, and the sanitizer that
// guarantees an unsupported value is never sent and never silently kept.
//
// Verified 2026-10-01 against Requesty's docs and the OpenAI behaviour they
// proxy (docs.requesty.ai/features/reasoning,
// docs.requesty.ai/api-reference/endpoint/models-list):
//   * temperature is an OpenAI-compatible 0..2 float — but OpenAI's reasoning
//     models (o-series, GPT-5 and later) answer 400 "Unsupported parameter:
//     'temperature' is not supported with this model", so a reasoning model
//     gets no temperature control at all.
//   * the output ceiling is `max_tokens` for classic models and
//     `max_completion_tokens` for reasoning models (they reject `max_tokens`).
//   * reasoning effort is low / medium / high for every OpenAI model, plus
//     `xhigh` only where OpenAI accepts it (GPT-5.4+, gpt-5.3-codex,
//     gpt-5.1-codex-max, GPT-6). `gpt-5-codex` answers 400 on `xhigh`.
//   * GET /v1/models returns `max_output_tokens`, `context_window` and
//     `supports_reasoning` per model — that catalog wins over any guess here.

import { modelLabel } from "./svgconfig";

/** Reasoning tiers, lowest first — the order the picker shows them in. */
export type Effort = "low" | "medium" | "high" | "xhigh";

export const EFFORT_ORDER: readonly Effort[] = ["low", "medium", "high", "xhigh"];

export const EFFORT_LABELS: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

/** No effort sent = the provider's own default, which varies by model. */
export const DEFAULT_EFFORT: Effort | null = null;

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 32_000;
/** A single SVG answer for up to 9 icons needs room; 1 000 is the floor. */
export const MAX_TOKENS_FLOOR = 1_000;
export const MAX_TOKENS_CEILING = 200_000;

export interface NumberRange {
  min: number;
  max: number;
  step: number;
}

/** What this model accepts, and where that knowledge came from. */
export interface ModelCaps {
  /** The model id these caps describe, for messages and labels. */
  model: string;
  /** True when the model reasons: effort picker, completion tokens, no temperature. */
  reasoning: boolean;
  /** null when the model refuses temperature outright. */
  temperature: NumberRange | null;
  /** The output-ceiling field name this model accepts. */
  tokenField: "max_tokens" | "max_completion_tokens";
  maxTokens: NumberRange;
  /** Empty when the model does not reason. */
  efforts: Effort[];
  /** Honest provenance, shown in the UI: catalog > family guess > conservative. */
  source: "catalog" | "family" | "default";
}

/** The three values the user controls, as they will be sent. */
export interface SamplingParams {
  temperature: number | null;
  maxTokens: number;
  effort: Effort | null;
}

/** One row of GET /v1/models, reduced to what the capability rules need. */
export interface CatalogModel {
  id: string;
  maxOutputTokens: number | null;
  supportsReasoning: boolean | null;
}

export const DEFAULT_PARAMS: SamplingParams = {
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  effort: DEFAULT_EFFORT,
};

const TEMPERATURE_RANGE: NumberRange = { min: 0, max: 2, step: 0.1 };

/** o-series and GPT-5/GPT-6 and later reason; everything else is assumed not to. */
const REASONING_ID = /(?:^|\/)(?:o[1-9][\w.-]*|gpt-[5-9][\w.-]*)/;
/** OpenAI accepts `xhigh` only on these; `gpt-5-codex` answers 400 for it. */
const XHIGH_ID = /(?:^|\/)(?:gpt-[5-9]\.[3-9][\w.-]*|gpt-[5-9]\.[1-9]-codex-max|gpt-[6-9](?:[\b.-]|$))/;

/**
 * Capabilities for one model id. The catalog wins when it has the model;
 * otherwise a documented family guess; otherwise the conservative default that
 * every OpenAI-compatible router accepts.
 */
export function capsFor(model: string, catalog?: readonly CatalogModel[] | null): ModelCaps {
  const entry = catalog?.find((m) => m.id === model) ?? null;
  const reasoning = entry?.supportsReasoning ?? reasonsByDefault(model);
  return {
    model,
    reasoning,
    temperature: temperatureFor(reasoning),
    tokenField: tokenFieldFor(reasoning),
    maxTokens: tokenRange(entry?.maxOutputTokens ?? null),
    efforts: reasoning ? effortsFor(model) : [],
    source: sourceFor(entry, reasoning),
  };
}

/** A reasoning model has no temperature: the router rejects it outright. */
const temperatureFor = (reasoning: boolean): NumberRange | null => (reasoning ? null : TEMPERATURE_RANGE);
const tokenFieldFor = (reasoning: boolean): ModelCaps["tokenField"] => (reasoning ? "max_completion_tokens" : "max_tokens");
const reasonsByDefault = (model: string): boolean => REASONING_ID.test(model);

function sourceFor(entry: CatalogModel | null, reasoning: boolean): ModelCaps["source"] {
  if (entry !== null) return "catalog";
  return reasoning ? "family" : "default";
}

function tokenRange(catalogMax: number | null): NumberRange {
  const max = catalogMax === null
    ? MAX_TOKENS_CEILING
    : Math.min(MAX_TOKENS_CEILING, Math.max(MAX_TOKENS_FLOOR, Math.round(catalogMax)));
  return { min: MAX_TOKENS_FLOOR, max, step: 1_000 };
}

/** low/medium/high everywhere; xhigh only where the docs say it is accepted. */
function effortsFor(model: string): Effort[] {
  return XHIGH_ID.test(model) ? ["low", "medium", "high", "xhigh"] : ["low", "medium", "high"];
}

export interface SanitizeOut {
  params: SamplingParams;
  /** Human-readable list of what had to change, for the warning the user sees. */
  reset: string[];
}

/**
 * Values that are safe to store and safe to send. Anything the model refuses is
 * dropped (never silently turned into something else) and reported, so the UI
 * can warn instead of quietly changing the user's setting.
 */
export function sanitizeParams(caps: ModelCaps, raw: Partial<SamplingParams> | null | undefined): SanitizeOut {
  const reset: string[] = [];
  const effort = effortOf(caps, raw?.effort);
  const params: SamplingParams = {
    temperature: temperatureOf(caps, raw?.temperature, reset),
    maxTokens: maxTokensOf(caps, raw?.maxTokens, reset),
    effort,
  };
  if (effort === null && raw?.effort !== null && raw?.effort !== undefined) {
    reset.push(`reasoning effort "${String(raw.effort)}" is not offered by ${modelLabel(caps.model)}`);
  }
  return { params, reset };
}

function temperatureOf(caps: ModelCaps, value: unknown, reset: string[]): number | null {
  if (caps.temperature === null) {
    if (value !== null && value !== undefined) {
      reset.push(`temperature is not supported by ${modelLabel(caps.model)}`);
    }
    return null;
  }
  return clampTemperature(caps, value);
}

function maxTokensOf(caps: ModelCaps, value: unknown, reset: string[]): number {
  const clamped = clampMaxTokens(caps, value);
  const n = numOf(value);
  if (n !== null && Math.round(n) !== clamped) {
    reset.push(`output tokens clamped into ${caps.maxTokens.min}–${caps.maxTokens.max}`);
  }
  return clamped;
}

/** The effort this model accepts, or null (provider default / not offered). */
export function effortOf(caps: ModelCaps, value: unknown): Effort | null {
  if (caps.efforts.length === 0) return null;
  if (typeof value === "string" && (caps.efforts as string[]).includes(value)) return value as Effort;
  return null;
}

export function clampTemperature(caps: ModelCaps, value: unknown): number | null {
  if (caps.temperature === null) return null;
  const n = numOf(value);
  if (n === null) return DEFAULT_TEMPERATURE;
  const stepped = Math.round(n / caps.temperature.step) * caps.temperature.step;
  return round1(Math.min(caps.temperature.max, Math.max(caps.temperature.min, stepped)));
}

export function clampMaxTokens(caps: ModelCaps, value: unknown): number {
  const n = numOf(value);
  if (n === null) return DEFAULT_MAX_TOKENS;
  return Math.min(caps.maxTokens.max, Math.max(caps.maxTokens.min, Math.round(n)));
}

/** null for null/undefined/non-numeric — never 0, which is a real value. */
function numOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "temperature 0.4 · 32 000 max tokens · effort high" — for the confirm dialog. */
export function paramsLabel(caps: ModelCaps, params: SamplingParams): string {
  const temp = caps.temperature === null || params.temperature === null
    ? "no temperature"
    : `temperature ${params.temperature}`;
  const tokens = `${groupDigits(params.maxTokens)} max tokens`;
  const effort = `effort ${params.effort === null ? "default" : params.effort}`;
  return caps.efforts.length === 0 ? `${temp} · ${tokens}` : `${temp} · ${tokens} · ${effort}`;
}

/** 32000 -> "32 000" (thin grouping, same wording everywhere a limit is shown). */
export function groupDigits(value: number): string {
  return value.toLocaleString("en-US").replace(/,/g, " ");
}
