// requesty.ts — documented OpenAI-compatible Requesty Chat Completions transport.
// The key is a Bearer header only; requests are never logged or automatically
// resubmitted after an uncertain network/provider outcome.

import type { SvgManifestItem, SvgUsage } from "./types";
import { batchPrompt, responseSchema } from "./prompt";

export const REQUESTY_MODEL_INFO = {
  id: "azure/gpt-6.1-sol@eastus2",
  contextTokens: 1_100_000,
  maxOutputTokens: 128_000,
  inputUsdPerMillion: 2,
  outputUsdPerMillion: 10,
  source: "https://www.requesty.ai/models/azure/gpt-6.1-sol-eastus2",
} as const;

interface RequestConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  rateLimitRetries: number;
  maxOutputTokens: number;
}

export interface RequestInput {
  config: RequestConfig;
  key: string;
  manifest: SvgManifestItem[];
  prompt: string;
  compositeDataUrl: string;
}

export type RequestOutcome =
  | { kind: "success"; content: string; usage: SvgUsage; requestId: string | null }
  | { kind: "failed"; safeError: string; status: number }
  | { kind: "unknown"; safeError: string; status: number | null };

type AttemptOutcome = RequestOutcome | { kind: "rate-limited"; delayMs: number };
type Fetcher = typeof fetch;

export function buildRequestPayload(input: RequestInput): Record<string, unknown> {
  return {
    model: input.config.model,
    messages: [
      { role: "system", content: "You return mapped, secure SVG source code. Follow the JSON response schema exactly." },
      { role: "user", content: [
        { type: "text", text: batchPrompt(input.manifest, input.prompt) },
        { type: "image_url", image_url: { url: input.compositeDataUrl } },
      ] },
    ],
    response_format: responseSchema(input.manifest),
    max_tokens: input.config.maxOutputTokens,
  };
}

export async function callRequesty(input: RequestInput, fetcher: Fetcher = fetch): Promise<RequestOutcome> {
  if (!isRequestyEndpoint(input.config.baseUrl)) {
    return { kind: "failed", status: 0, safeError: "Only the Requesty router endpoint is allowed; no request was sent." };
  }
  for (let attempt = 0; ; attempt++) {
    const result = await requestOnce(input, fetcher, attempt);
    if (result.kind !== "rate-limited") return result;
    if (attempt >= input.config.rateLimitRetries || result.delayMs > 30_000) {
      return { kind: "failed", status: 429, safeError: "Requesty rate limited this request (429); bounded retry policy stopped without resending." };
    }
    await wait(result.delayMs);
  }
}

async function requestOnce(input: RequestInput, fetcher: Fetcher, attempt: number): Promise<AttemptOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, input.config.timeoutMs);
  try {
    const response = await fetcher(completionsUrl(input.config.baseUrl), requestInit(input, controller.signal));
    if (response.status === 429) return { kind: "rate-limited", delayMs: retryDelay(response, attempt) };
    if (!response.ok) return httpFailure(response.status);
    return await parseSuccess(response);
  } catch {
    const cause = timedOut ? "timed out" : "lost its response";
    return { kind: "unknown", status: null, safeError: `Requesty request ${cause}; outcome unknown. Do not resubmit automatically.` };
  } finally {
    clearTimeout(timer);
  }
}

function requestInit(input: RequestInput, signal: AbortSignal): RequestInit {
  return {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.key}` },
    body: JSON.stringify(buildRequestPayload(input)),
  };
}

function isRequestyEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "router.requesty.ai"
      && !url.port && url.pathname.replace(/\/$/, "") === "/v1" && !url.username && !url.password
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function completionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function httpFailure(status: number): RequestOutcome {
  const safeError = status === 401 ? "Requesty rejected the API key (401)."
    : status === 402 ? "Requesty account balance is insufficient (402)."
      : status === 403 ? "Requesty denied key or model access (403)."
        : status === 404 ? "Requesty model is unavailable (404). Check the exact model ID."
          : status === 412 ? "Requesty spend limit was reached (412)."
            : status === 413 ? "Requesty rejected the payload as too large (413). Reduce the batch or cell size."
              : status === 400 ? "Requesty rejected the request format or model parameters (400)."
                : uncertainStatus(status) ? `Requesty returned ${status}; request outcome is unknown. Do not resubmit automatically.`
                  : `Requesty rejected the request (${status}).`;
  return uncertainStatus(status) ? { kind: "unknown", status, safeError } : { kind: "failed", status, safeError };
}

function uncertainStatus(status: number): boolean {
  return status === 408 || status === 424 || status === 499 || status === 502 || status === 503
    || status === 504 || status === 529 || status >= 500;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : Number.NaN;
  const date = header && !Number.isFinite(seconds) ? Date.parse(header) - Date.now() : Number.NaN;
  const requested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : date;
  return Number.isFinite(requested) && requested > 0 ? requested : Math.min(1000 * 2 ** attempt, 30_000);
}

async function parseSuccess(response: Response): Promise<RequestOutcome> {
  try {
    const body: unknown = await response.json();
    const record = asRecord(body);
    const choice = firstChoice(record?.choices);
    const message = asRecord(choice?.message);
    const content = textContent(message?.content);
    if (!content) return { kind: "unknown", status: 200, safeError: "Requesty returned no usable content (200); the outcome is unknown. Do not resubmit automatically." };
    return {
      kind: "success", content, usage: parseUsage(record?.usage),
      requestId: response.headers.get("x-requesty-request-id") ?? response.headers.get("x-request-id"),
    };
  } catch {
    return { kind: "unknown", status: 200, safeError: "Requesty returned malformed JSON (200); outcome is unknown. Do not resubmit automatically." };
  }
}

function parseUsage(raw: unknown): SvgUsage {
  const usage = asRecord(raw);
  return {
    inputTokens: nonNegative(usage?.prompt_tokens),
    outputTokens: nonNegative(usage?.completion_tokens),
    totalTokens: nonNegative(usage?.total_tokens),
    actualCostUsd: nonNegative(usage?.cost),
  };
}

function firstChoice(raw: unknown): Record<string, unknown> | null {
  return Array.isArray(raw) ? asRecord(raw[0]) : null;
}

function textContent(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!Array.isArray(raw)) return "";
  return raw.map((part) => asRecord(part)?.text).filter((part): part is string => typeof part === "string").join("\n").trim();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

function nonNegative(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
