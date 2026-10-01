// svgconfig.ts — Requesty provider settings for SVG generation (RULE 3/13).
// Owns: the documented endpoint defaults, the verified model identifier and
// every tunable (timeout, retries, concurrency, images per request) plus the
// parse/serialize pair that makes a stored payload safe to read back.
//
// Verified 2026-10-01 against Requesty's docs (docs.requesty.ai/quickstart,
// /features/image-understanding, /features/cost-tracking) and the model page
// https://www.requesty.ai/models/openai/gpt-6.1-sol:
//   * OpenAI-compatible base URL  https://router.requesty.ai/v1
//   * model ids are "provider/model" -> the GPT 6.1 Sol id is
//     "openai/gpt-6.1-sol" (bare "gpt-6.1-sol" is NOT a Requesty id)
//   * per-request cost arrives in usage.cost (USD)

export const PROVIDER_NAME = "Requesty";
export const DEFAULT_BASE_URL = "https://router.requesty.ai/v1";
export const DEFAULT_MODEL = "openai/gpt-6.1-sol";
export const DEFAULT_MODEL_LABEL = "GPT 6.1 Sol";

export const DEFAULT_TIMEOUT_MS = 90_000;
/**
 * The wait may be configured up to 15 minutes: a high-effort reasoning request
 * is documented to take minutes, and the effort floors in lib/effortlimits
 * (low 120 s, medium 300 s, high 600 s) have to fit inside this range.
 */
export const TIMEOUT_MIN_MS = 5_000;
export const TIMEOUT_MAX_MS = 900_000;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_CONCURRENCY = 4;
/** Output ceiling sent with each request (0 = let the provider decide). */
export const DEFAULT_MAX_TOKENS = 32_000;
export const MAX_TOKENS_MIN = 1_000;
export const MAX_TOKENS_MAX = 200_000;

/** One request may carry 1..9 images — the composite grid is square (svgbatch). */
export const IMAGES_PER_REQUEST_MIN = 1;
export const IMAGES_PER_REQUEST_MAX = 9;
export const DEFAULT_IMAGES_PER_REQUEST = 4;

/** Longest prompt kept per version in a sidecar (keeps the JSON readable). */
export const PROMPT_KEEP = 20_000;

export interface SvgConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  concurrency: number;
  imagesPerRequest: number;
  maxTokens: number;
}

export const DEFAULT_CONFIG: SvgConfig = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retries: DEFAULT_RETRIES,
  concurrency: DEFAULT_CONCURRENCY,
  imagesPerRequest: DEFAULT_IMAGES_PER_REQUEST,
  maxTokens: DEFAULT_MAX_TOKENS,
};

/** Clamps the batch size into the documented grid range and snaps to integer. */
export function clampImagesPerRequest(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IMAGES_PER_REQUEST;
  const n = Math.round(value);
  return Math.min(IMAGES_PER_REQUEST_MAX, Math.max(IMAGES_PER_REQUEST_MIN, n));
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** "openai/gpt-6.1-sol" -> "GPT 6.1 Sol" (display only; never sent as the id). */
export function modelLabel(id: string): string {
  const tail = id.split("/").pop() ?? id;
  const words = tail.split("-").filter(Boolean).map((w) => w.toUpperCase() === "GPT" ? "GPT" : cap(w));
  return words.join(" ");
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Full chat-completions URL for the configured base (no trailing slash dupes). */
export function chatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** The model list endpoint on the same base — the capability source of truth. */
export function chatModelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

/**
 * Stored payload → config. A missing or nonsensical field falls back to the
 * documented default instead of throwing, so one bad value can never stop the
 * tab from opening (RULE 13).
 */
export function parseConfig(raw: unknown): SvgConfig {
  if (!isRecord(raw)) return { ...DEFAULT_CONFIG };
  return {
    baseUrl: urlOf(raw.baseUrl),
    model: textOf(raw.model, DEFAULT_MODEL),
    timeoutMs: clampRange(raw.timeoutMs, TIMEOUT_MIN_MS, TIMEOUT_MAX_MS, DEFAULT_TIMEOUT_MS),
    retries: clampRange(raw.retries, 0, 5, DEFAULT_RETRIES),
    concurrency: clampRange(raw.concurrency, 1, 8, DEFAULT_CONCURRENCY),
    imagesPerRequest: clampImagesPerRequest(Number(raw.imagesPerRequest)),
    maxTokens: toMaxTokens(raw.maxTokens),
  };
}

/** 0 means "let the provider decide"; anything else is clamped into range. */
function toMaxTokens(value: unknown): number {
  const n = clampRange(value, 0, MAX_TOKENS_MAX, DEFAULT_MAX_TOKENS);
  return n === 0 || n >= MAX_TOKENS_MIN ? n : MAX_TOKENS_MIN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function urlOf(value: unknown): string {
  const text = textOf(value, DEFAULT_BASE_URL);
  return /^https?:\/\//i.test(text) ? text : DEFAULT_BASE_URL;
}

export function serializeConfig(c: SvgConfig): string {
  return JSON.stringify(c);
}

/** "Requesty · GPT 6.1 Sol" — one line for the confirm dialog and the rows. */
export function providerLabel(c: SvgConfig): string {
  return `${PROVIDER_NAME} · ${modelLabel(c.model)}`;
}
