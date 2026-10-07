// gemconfig.ts — Gemini provider settings for the SVG-to-upload tab (design
// §7, RULE 3/13). Owns: the documented endpoint default, the verified model
// id, every tunable (timeout, retries, concurrency) with clamp-on-read, the
// localStorage key, and the VERSIONED rate card the estimated cost is always
// computed from — the API reports tokens, never money.
//
// Verified 2026-10-07 against ai.google.dev/gemini-api/docs/models/
// gemini-3.1-flash-lite and /docs/pricing: model id stable, $0.25 per million
// input tokens, $1.50 per million output tokens.

export const GEMINI_PROVIDER_NAME = "Google Gemini";

/** localStorage key (design §5: iconSplitter.upload.gemini.v1). */
export const GEMINI_STORAGE_KEY = "iconSplitter.upload.gemini.v1";

export const DEFAULT_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com";
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export const GEMINI_TIMEOUT_MIN_S = 5;
export const GEMINI_TIMEOUT_MAX_S = 900;
export const GEMINI_TIMEOUT_DEFAULT_S = 120;
export const GEMINI_RETRIES_MIN = 0;
export const GEMINI_RETRIES_MAX = 5;
export const GEMINI_RETRIES_DEFAULT = 2;
export const GEMINI_CONCURRENCY_MIN = 1;
export const GEMINI_CONCURRENCY_MAX = 4;
export const GEMINI_CONCURRENCY_DEFAULT = 2;

export interface GeminiConfig {
  endpoint: string;
  model: string;
  timeoutS: number;
  /** CONFIRMED failures only — unknown outcomes are never resubmitted. */
  retries: number;
  concurrency: number;
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  endpoint: DEFAULT_GEMINI_ENDPOINT,
  model: DEFAULT_GEMINI_MODEL,
  timeoutS: GEMINI_TIMEOUT_DEFAULT_S,
  retries: GEMINI_RETRIES_DEFAULT,
  concurrency: GEMINI_CONCURRENCY_DEFAULT,
};

/** Stored payload → config; a bad field falls back, clamped on read (RULE 13). */
export function parseGeminiConfig(raw: unknown): GeminiConfig {
  if (!isRecord(raw)) return { ...DEFAULT_GEMINI_CONFIG };
  return {
    endpoint: urlOf(raw.endpoint),
    model: textOf(raw.model, DEFAULT_GEMINI_MODEL),
    timeoutS: clampRange(raw.timeoutS, GEMINI_TIMEOUT_MIN_S, GEMINI_TIMEOUT_MAX_S, GEMINI_TIMEOUT_DEFAULT_S),
    retries: clampRange(raw.retries, GEMINI_RETRIES_MIN, GEMINI_RETRIES_MAX, GEMINI_RETRIES_DEFAULT),
    concurrency: clampRange(raw.concurrency, GEMINI_CONCURRENCY_MIN, GEMINI_CONCURRENCY_MAX, GEMINI_CONCURRENCY_DEFAULT),
  };
}

export function serializeGeminiConfig(c: GeminiConfig): string {
  return JSON.stringify(c);
}

/** POST {endpoint}/v1beta/models/{model}:generateContent (design §7). */
export function generateContentUrl(endpoint: string, model: string): string {
  return `${endpoint.replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

/** "Google Gemini · gemini-3.1-flash-lite" — one line for dialogs and rows. */
export function geminiProviderLabel(c: GeminiConfig): string {
  return `${GEMINI_PROVIDER_NAME} · ${c.model}`;
}

/** The endpoint's hostname for the record — the only endpoint detail stored. */
export function endpointHostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

/** The versioned rate card — the ONLY source of cost, always an estimate. */
export const RATE_CARD_VERSION = "gemini-3.1-flash-lite@2026-10-07";
export const RATE_CARD = { inputPerMToken: 0.25, outputPerMToken: 1.5, currency: "USD" } as const;

/** Estimated cost in USD from reported token counts (design §7). */
export function estimatedCostUsd(tokens: { input: number; output: number }): number {
  return (tokens.input / 1_000_000) * RATE_CARD.inputPerMToken + (tokens.output / 1_000_000) * RATE_CARD.outputPerMToken;
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function urlOf(value: unknown): string {
  const text = textOf(value, DEFAULT_GEMINI_ENDPOINT);
  return /^https?:\/\//i.test(text) ? text : DEFAULT_GEMINI_ENDPOINT;
}
