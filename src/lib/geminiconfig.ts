// geminiconfig.ts — the Gemini provider settings for metadata generation
// (RULE 3/13/20). Owns: the VERIFIED endpoint and model identifier, every
// tunable (timeout, retries, concurrency, temperature, output ceiling, whether
// structured output is asked for), the parse/serialize pair that makes a stored
// payload safe to read back, and the rate card the cost ESTIMATE cites.
//
// Verified 2026-10-07 against ai.google.dev:
//   * POST {base}/models/{model}:generateContent, header x-goog-api-key
//   * "gemini-3.1-flash-lite" is a STABLE, GA model id (GA 2026-05-07) with
//     text output, image input and structured outputs.
//   * the REST answer reports TOKENS, never currency — so every money figure
//     this app shows is labelled Estimated and cites this rate card.

import { isRecord } from "./isrecord";

export const GEMINI_PROVIDER = "Gemini";
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
/** The day the id above was checked against the provider's own documentation. */
export const MODEL_VERIFIED_ON = "2026-10-07";

export const TIMEOUT_MIN_MS = 5_000;
export const TIMEOUT_MAX_MS = 300_000;
export const DEFAULT_TIMEOUT_MS = 90_000;
export const RETRIES_MIN = 0;
export const RETRIES_MAX = 3;
export const DEFAULT_RETRIES = 1;
export const CONCURRENCY_MIN = 1;
export const CONCURRENCY_MAX = 4;
export const DEFAULT_CONCURRENCY = 2;
export const MAX_OUTPUT_MIN = 1_000;
export const MAX_OUTPUT_MAX = 32_000;
export const DEFAULT_MAX_OUTPUT = 4_000;

export interface GeminiConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  concurrency: number;
  /** 0 = deterministic. Metadata is a labelling task, not a creative one. */
  temperature: number;
  maxOutputTokens: number;
  /** Ask for `responseMimeType: application/json` + a schema. */
  structured: boolean;
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retries: DEFAULT_RETRIES,
  concurrency: DEFAULT_CONCURRENCY,
  temperature: 0,
  maxOutputTokens: DEFAULT_MAX_OUTPUT,
  structured: true,
};

/** The generateContent endpoint: base + model + method, no trailing slashes. */
export function generateContentUrl(baseUrl: string, model: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models/${model.trim()}:generateContent`;
}

/** "gemini-3.1-flash-lite" -> "Gemini 3.1 Flash-Lite" (display only). */
export function modelLabel(id: string): string {
  const words = id.split("/").pop()?.split("-").filter(Boolean) ?? [];
  return words.map(capitalise).join(" ");
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function parseGeminiConfig(raw: unknown): GeminiConfig {
  if (!isRecord(raw)) return { ...DEFAULT_GEMINI_CONFIG };
  return {
    baseUrl: urlOf(raw.baseUrl),
    model: textOf(raw.model, DEFAULT_MODEL),
    timeoutMs: clamp(raw.timeoutMs, TIMEOUT_MIN_MS, TIMEOUT_MAX_MS, DEFAULT_TIMEOUT_MS),
    retries: clamp(raw.retries, RETRIES_MIN, RETRIES_MAX, DEFAULT_RETRIES),
    concurrency: clamp(raw.concurrency, CONCURRENCY_MIN, CONCURRENCY_MAX, DEFAULT_CONCURRENCY),
    temperature: clampFloat(raw.temperature, 0, 2, DEFAULT_GEMINI_CONFIG.temperature),
    maxOutputTokens: clamp(raw.maxOutputTokens, MAX_OUTPUT_MIN, MAX_OUTPUT_MAX, DEFAULT_MAX_OUTPUT),
    structured: raw.structured !== false,
  };
}

export function serializeGeminiConfig(config: GeminiConfig): GeminiConfig {
  return parseGeminiConfig(config);
}

/** The rate card, dated: an estimate is only honest with its own source. */
export const RATE_CARD = {
  version: `${DEFAULT_MODEL}@${MODEL_VERIFIED_ON}`,
  currency: "USD",
  inputPerMillion: 0.25,
  outputPerMillion: 1.5,
} as const;

export interface GeminiUsage {
  input: number | null;
  output: number | null;
  total: number | null;
}

/** Tokens -> an ESTIMATED cost, in the shape every other record already uses. */
export function estimateCost(usage: GeminiUsage): {
  actual: null; estimated: number | null; currency: string; pricing: string; basis: "rate-card" | "none";
} {
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (usage.input === null && usage.output === null) {
    return { actual: null, estimated: null, currency: RATE_CARD.currency, pricing: RATE_CARD.version, basis: "none" };
  }
  const amount = (input / 1e6) * RATE_CARD.inputPerMillion + (output / 1e6) * RATE_CARD.outputPerMillion;
  return {
    actual: null, estimated: round6(amount), currency: RATE_CARD.currency,
    pricing: RATE_CARD.version, basis: "rate-card",
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function urlOf(value: unknown): string {
  const text = textOf(value, DEFAULT_BASE_URL);
  return /^https:\/\//i.test(text) ? text : DEFAULT_BASE_URL;
}
