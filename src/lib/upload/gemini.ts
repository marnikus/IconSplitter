// gemini.ts — the Gemini generateContent call for metadata generation
// (design §2.8, §3.1). Owns: the verified endpoint/model defaults (model page
// ai.google.dev, "Stable: gemini-3.1-flash-lite", checked 2026-10-06), the
// URL, the `x-goog-api-key` auth HEADER (never the URL query — keys stay out
// of logs), the multimodal request builder (text + camelCase `inlineData`),
// the response readers (answer text / usage / refusal), failure
// classification, and the single-attempt send with injectable fetch + timeout.
// Retries and cancellation are policy and live in the runner (mirrors
// lib/svgrequest); per design §5 a disconnect/timeout is outcome-unknown and
// is NEVER auto-retried — no duplicate paid submission.

import { isRecord } from "../isrecord";
import { parseJson, readRetryAfterMs } from "../svgrequest";
import {
  classifyGeminiHttp, classifyGeminiTransport, type GeminiFailure,
} from "./geminifail";

export type { GeminiFailure, GeminiFailKind } from "./geminifail";

export const PROVIDER_NAME = "Gemini";
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
/** The auth header name — the key travels here, never in the URL or a log. */
export const AUTH_HEADER = "x-goog-api-key";

export const TIMEOUT_MIN_MS = 5_000;
export const TIMEOUT_MAX_MS = 900_000;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const RETRIES_MIN = 0;
export const RETRIES_MAX = 5;
export const DEFAULT_RETRIES = 2;
export const CONCURRENCY_MIN = 1;
export const CONCURRENCY_MAX = 8;
export const DEFAULT_CONCURRENCY = 4;

export interface GeminiConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  concurrency: number;
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retries: DEFAULT_RETRIES,
  concurrency: DEFAULT_CONCURRENCY,
};

export function clampTimeoutMs(value: unknown): number {
  return clampRange(value, TIMEOUT_MIN_MS, TIMEOUT_MAX_MS, DEFAULT_TIMEOUT_MS);
}

export function clampRetries(value: unknown): number {
  return clampRange(value, RETRIES_MIN, RETRIES_MAX, DEFAULT_RETRIES);
}

export function clampConcurrency(value: unknown): number {
  return clampRange(value, CONCURRENCY_MIN, CONCURRENCY_MAX, DEFAULT_CONCURRENCY);
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** `POST {base}/models/{model}:generateContent` (no trailing-slash dupes). */
export function generateContentUrl(baseUrl: string, model: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(model)}:generateContent`;
}

/** Stored payload → config; one bad field costs one default (RULE 13). */
export function parseGeminiConfig(raw: unknown): GeminiConfig {
  if (!isRecord(raw)) return { ...DEFAULT_GEMINI_CONFIG };
  return {
    baseUrl: urlOf(raw.baseUrl),
    model: textOf(raw.model, DEFAULT_MODEL),
    timeoutMs: clampTimeoutMs(raw.timeoutMs),
    retries: clampRetries(raw.retries),
    concurrency: clampConcurrency(raw.concurrency),
  };
}

export function serializeGeminiConfig(c: GeminiConfig): string {
  return JSON.stringify(c);
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function urlOf(value: unknown): string {
  const text = textOf(value, DEFAULT_BASE_URL);
  return /^https?:\/\//i.test(text) ? text : DEFAULT_BASE_URL;
}

// --- wire shapes ------------------------------------------------------------

export interface GeminiRequest {
  contents: [{ role: "user"; parts: [{ text: string }, { inlineData: { mimeType: string; data: string } }] }];
}

/** The multimodal body: prompt text + the icon as a base64 inline image. */
export function buildGeminiRequest(prompt: string, imageDataUrl: string): GeminiRequest {
  const comma = imageDataUrl.indexOf(",");
  if (!imageDataUrl.startsWith("data:") || comma < 0) {
    throw new Error("the icon must be a data URL (data:<mime>;base64,<data>)");
  }
  const mimeType = imageDataUrl.slice(5, comma).split(";")[0];
  return {
    contents: [{
      role: "user",
      parts: [{ text: prompt }, { inlineData: { mimeType, data: imageDataUrl.slice(comma + 1) } }],
    }],
  };
}

export interface GeminiUsage {
  input: number | null;
  output: number | null;
  total: number | null;
}

/** usageMetadata.{promptTokenCount,candidatesTokenCount,totalTokenCount}. */
export function readGeminiUsage(raw: unknown): GeminiUsage {
  const meta = isRecord(raw) && isRecord(raw.usageMetadata) ? raw.usageMetadata : null;
  if (meta === null) return { input: null, output: null, total: null };
  return {
    input: num(meta.promptTokenCount),
    output: num(meta.candidatesTokenCount),
    total: num(meta.totalTokenCount),
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** candidates[0].content.parts[].text, joined; null when there is no answer. */
export function readGeminiText(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.candidates) || raw.candidates.length === 0) return null;
  const first: unknown = raw.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) return null;
  const text = first.content.parts
    .map((part: unknown) => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("");
  return text.trim() === "" ? null : text;
}

/**
 * candidates[0].finishReason exactly as the provider reports it (CP-8), or null
 * when the frame says nothing. "MAX_TOKENS" is how a truncated answer announces
 * itself — the one signal that must never be guessed from the parsed text.
 */
export function readGeminiFinish(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.candidates) || raw.candidates.length === 0) return null;
  const first: unknown = raw.candidates[0];
  if (!isRecord(first)) return null;
  const reason = first.finishReason;
  return typeof reason === "string" && reason !== "" && reason !== "FINISH_REASON_UNSPECIFIED" ? reason : null;
}

/** True when the provider stopped the answer for a LENGTH reason (truncation). */
export function isTruncatedFinish(reason: string | null): boolean {
  return reason === "MAX_TOKENS" || reason === "LENGTH";
}

/** The refusal reason, or null: promptFeedback.blockReason / finishReason SAFETY. */
export function readGeminiBlock(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.promptFeedback)) {
    const reason = raw.promptFeedback.blockReason;
    if (typeof reason === "string" && reason !== "" && reason !== "BLOCK_REASON_UNSPECIFIED") return reason;
  }
  if (Array.isArray(raw.candidates) && raw.candidates.length > 0) {
    const first: unknown = raw.candidates[0];
    if (isRecord(first) && first.finishReason === "SAFETY") return "SAFETY";
  }
  return null;
}

// --- the single attempt -------------------------------------------------------

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GeminiSendArgs {
  config: GeminiConfig;
  apiKey: string;
  request: GeminiRequest;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export type GeminiSendOut =
  | { ok: true; text: string; usage: GeminiUsage; status: number; finish: string | null }
  | { ok: false; failure: GeminiFailure };

/** One attempt: POST with the auth header, bounded by the configured timeout. */
export async function sendGemini(args: GeminiSendArgs): Promise<GeminiSendOut> {
  const { config, apiKey, request } = args;
  const bound = boundedRequest(config.timeoutMs, args.signal);
  try {
    const response = await (args.fetch ?? fetch)(generateContentUrl(config.baseUrl, config.model), {
      method: "POST",
      headers: { "content-type": "application/json", [AUTH_HEADER]: apiKey.trim() },
      body: JSON.stringify(request),
      signal: bound.signal,
    });
    return await readGeminiResponse(response);
  } catch (error) {
    const cancelled = args.signal?.aborted === true;
    return { ok: false, failure: classifyGeminiTransport(error, { cancelled, timedOut: bound.timedOut() }) };
  } finally {
    bound.done();
  }
}

/**
 * One bounded request window: the configured timeout plus an optional outer
 * cancel. Shared by every request this client makes, so "the request window
 * closed" means exactly one thing (RULE 10).
 */
export function boundedRequest(timeoutMs: number, outer?: AbortSignal): {
  signal: AbortSignal; timedOut: () => boolean; done: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (outer !== undefined) linkAbort(outer, controller);
  return { signal: controller.signal, timedOut: () => timedOut, done: () => clearTimeout(timer) };
}

function linkAbort(signal: AbortSignal, controller: AbortController): void {
  if (signal.aborted) {
    controller.abort(signal.reason);
    return;
  }
  signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
}

async function readGeminiResponse(response: Response): Promise<GeminiSendOut> {
  const text = await response.text();
  const body = parseJson(text);
  if (!response.ok) {
    return { ok: false, failure: classifyGeminiHttp(response.status, body, readRetryAfterMs(response.headers)) };
  }
  const blocked = readGeminiBlock(body);
  if (blocked !== null) {
    return { ok: false, failure: { kind: "blocked", message: `the provider blocked the request (${blocked})`, retryAfterMs: null, retryable: false, status: response.status } };
  }
  const answer = readGeminiText(body);
  if (answer === null) {
    return { ok: false, failure: { kind: "malformed", message: "no answer text in response", retryAfterMs: null, retryable: false, status: response.status } };
  }
  return { ok: true, text: answer, usage: readGeminiUsage(body), status: response.status, finish: readGeminiFinish(body) };
}
