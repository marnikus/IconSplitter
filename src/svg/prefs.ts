// prefs.ts — validated, non-secret SVG controls. Settings survive restart, but
// the Requesty credential has a separate encrypted vault and never enters here.

import { isRecord } from "../lib/isrecord";

export const DEFAULT_PROMPT = "Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or approximate joins. Preserve seamless geometry without breaking the intended image.";
export const DEFAULT_MODEL = "azure/gpt-6.1-sol@eastus2";
const DEFAULT_BASE_URL = "https://router.requesty.ai/v1";
const MAX_IMAGES_PER_REQUEST = 9;

export interface SvgPreferences {
  prompt: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  rateLimitRetries: number;
  concurrency: number;
  imagesPerRequest: number;
  cellSize: number;
  paddingPx: number;
  maxPayloadBytes: number;
  maxOutputTokens: number;
  autoReducePayload: boolean;
  generationFilter: "all" | "pending" | "generating" | "generated" | "recovered" | "recoverable" | "failed" | "unknown" | "corrupt";
  reviewFilter: "all" | "pending" | "approved" | "declined";
  sortBy: "date" | "name" | "generation" | "review" | "cost";
  sortDirection: "asc" | "desc";
  thumbHeight: number;
  search: string;
}

export const DEFAULT_SVG_PREFERENCES: SvgPreferences = {
  prompt: DEFAULT_PROMPT, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL,
  timeoutMs: 90_000, rateLimitRetries: 0, concurrency: 1, imagesPerRequest: 4,
  cellSize: 512, paddingPx: 32, maxPayloadBytes: 15 * 1024 * 1024,
  maxOutputTokens: 8192, autoReducePayload: true,
  generationFilter: "all", reviewFilter: "all", sortBy: "date", sortDirection: "desc", thumbHeight: 68, search: "",
};

type RunPreferences = Pick<SvgPreferences,
  "prompt" | "baseUrl" | "model" | "timeoutMs" | "rateLimitRetries" | "concurrency" |
  "imagesPerRequest" | "cellSize" | "paddingPx" | "maxPayloadBytes" | "maxOutputTokens" | "autoReducePayload">;
type ReviewViewPreferences = Pick<SvgPreferences,
  "generationFilter" | "reviewFilter" | "sortBy" | "sortDirection" | "thumbHeight" | "search">;

export function parseSvgPreferences(raw: unknown): SvgPreferences {
  if (!isRecord(raw)) return DEFAULT_SVG_PREFERENCES;
  return { ...parseRunPreferences(raw), ...parseReviewViewPreferences(raw) };
}

function parseRunPreferences(raw: Record<string, unknown>): RunPreferences {
  return {
    prompt: text(raw.prompt, DEFAULT_PROMPT, 12_000), baseUrl: httpsUrl(raw.baseUrl), model: text(raw.model, DEFAULT_MODEL, 200),
    timeoutMs: integer(raw.timeoutMs, 10_000, 300_000, 90_000), rateLimitRetries: integer(raw.rateLimitRetries, 0, 5, 0),
    concurrency: integer(raw.concurrency, 1, 4, 1), imagesPerRequest: integer(raw.imagesPerRequest, 1, MAX_IMAGES_PER_REQUEST, 4),
    cellSize: nearestCell(raw.cellSize), paddingPx: integer(raw.paddingPx, 8, 96, 32),
    maxPayloadBytes: integer(raw.maxPayloadBytes, 256_000, 50 * 1024 * 1024, 15 * 1024 * 1024),
    maxOutputTokens: integer(raw.maxOutputTokens, 256, 128_000, 8192), autoReducePayload: raw.autoReducePayload !== false,
  };
}

function parseReviewViewPreferences(raw: Record<string, unknown>): ReviewViewPreferences {
  return {
    generationFilter: choice(raw.generationFilter, ["all", "pending", "generating", "generated", "recovered", "recoverable", "failed", "unknown", "corrupt"], "all"),
    reviewFilter: choice(raw.reviewFilter, ["all", "pending", "approved", "declined"], "all"),
    sortBy: choice(raw.sortBy, ["date", "name", "generation", "review", "cost"], "date"),
    sortDirection: choice(raw.sortDirection, ["asc", "desc"], "desc"),
    thumbHeight: integer(raw.thumbHeight, 48, 180, 68), search: text(raw.search, "", 300),
  };
}

export function containsCredential(text: string): boolean {
  return /(?:rq_(?:live|sk)_[a-z0-9_-]{8,}|sk-[a-z0-9_-]{16,})/i.test(text);
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.length <= max && !containsCredential(value) ? value : fallback;
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_BASE_URL;
  try {
    const parsed = new URL(value);
    return isAllowedRequestyUrl(parsed, value) ? parsed.toString().replace(/\/$/, "") : DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function isAllowedRequestyUrl(url: URL, source: string): boolean {
  return url.protocol === "https:" && url.hostname.toLowerCase() === "router.requesty.ai"
    && !url.port && url.pathname.replace(/\/$/, "") === "/v1" && !url.username && !url.password
    && !url.search && !url.hash && !containsCredential(source);
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function nearestCell(value: unknown): number {
  const sizes = [256, 384, 512, 768, 1024];
  if (typeof value !== "number" || !Number.isFinite(value)) return 512;
  return sizes.reduce((best, size) => Math.abs(size - value) < Math.abs(best - value) ? size : best, sizes[0]);
}

function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
