// svgresponse.ts — safe parsing and classification of a completed chat response.
// Owns OpenAI-compatible JSON fields, usage, request IDs and failure semantics.

import { isRecord } from "./isrecord";

export interface Usage {
  input: number | null;
  output: number | null;
  total: number | null;
  /** Provider-reported USD cost for this request; null when not reported. */
  cost: number | null;
  currency: string;
  /** Present only on an allocated estimate — never on a provider-reported usage. */
  estimated?: number | null;
}

export const NO_USAGE: Usage = { input: null, output: null, total: null, cost: null, currency: "USD" };

/** Reads usage straight from a completed response — never invents a number. */
export function readUsage(raw: unknown): Usage {
  const usage = isRecord(raw) && isRecord(raw.usage) ? raw.usage : null;
  if (!usage) return { ...NO_USAGE };
  return {
    input: num(usage.prompt_tokens), output: num(usage.completion_tokens), total: num(usage.total_tokens),
    cost: num(usage.cost), currency: typeof usage.currency === "string" ? usage.currency : "USD",
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** choices[0].message.content, or null when the terminal JSON shape is invalid. */
export function readContent(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.choices) || raw.choices.length === 0) return null;
  const first: unknown = raw.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  const content = first.message.content;
  return typeof content === "string" && content.trim() !== "" ? content : null;
}

/** choices[0].finish_reason — "stop", "length", "tool_calls"…, or null. */
export function readFinishReason(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.choices) || raw.choices.length === 0) return null;
  const first: unknown = raw.choices[0];
  return isRecord(first) && typeof first.finish_reason === "string" ? first.finish_reason : null;
}

export type HeadersLike = { get(name: string): string | null };

export function readRequestId(headers: HeadersLike | undefined): string | null {
  return headerOf(headers, "x-request-id") ?? headerOf(headers, "request-id");
}

function headerOf(headers: HeadersLike | undefined, name: string): string | null {
  if (!headers) return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

/** Retry-After as milliseconds: seconds form, or an HTTP date. */
export function readRetryAfterMs(headers: HeadersLike | undefined): number | null {
  const raw = headerOf(headers, "retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export type FailKind = "auth" | "rate_limit" | "model" | "malformed" | "provider" | "network" | "timeout" | "aborted" | "payload" | "truncated" | "incomplete";

export interface Failure {
  kind: FailKind;
  message: string;
  retryAfterMs: number | null;
  /** Only a terminal HTTP 429 is safe for automatic resubmission. */
  retryable: boolean;
  /** Unknown means the provider may have completed or charged the request. */
  outcome: "confirmed" | "unknown";
  status: number | null;
}

/** HTTP failure → classified failure. Body text is used, never trusted raw. */
export function classifyHttp(status: number, body: unknown, retryAfterMs: number | null): Failure {
  const detail = errorDetail(body);
  return {
    ...classifyStatus(status, body), status, retryAfterMs,
    message: `${status} ${detail}`.trim(),
  };
}

type HttpDisposition = Pick<Failure, "kind" | "retryable" | "outcome">;

function classifyStatus(status: number, body: unknown): HttpDisposition {
  const explicit = explicitStatus(status, body);
  if (explicit !== null) return explicit;
  const server = serverStatus(status, body);
  return server ?? { kind: "malformed", retryable: false, outcome: "confirmed" };
}

function explicitStatus(status: number, body: unknown): HttpDisposition | null {
  if (status === 401 || status === 403) return { kind: "auth", retryable: false, outcome: "confirmed" };
  if (status === 429) return { kind: "rate_limit", retryable: true, outcome: "confirmed" };
  if (status === 400 || status === 404) {
    return { kind: isModelError(body) ? "model" : "payload", retryable: false, outcome: "confirmed" };
  }
  return null;
}

function serverStatus(status: number, body: unknown): HttpDisposition | null {
  if (status === 408 || status === 504) return { kind: "timeout", retryable: false, outcome: "unknown" };
  if (status >= 500) return serverFailure(body);
  return null;
}

function serverFailure(body: unknown): HttpDisposition {
  return isTimeoutError(body)
    ? { kind: "timeout", retryable: false, outcome: "unknown" }
    : { kind: "provider", retryable: false, outcome: "unknown" };
}

function isTimeoutError(body: unknown): boolean {
  return /\b(?:timeout|timed\s+out|time\s+out)\b/i.test(errorDetail(body));
}

function isModelError(body: unknown): boolean {
  const text = errorDetail(body).toLowerCase();
  return text.includes("model") && (text.includes("not found") || text.includes("unavailable") || text.includes("does not exist"));
}

function errorDetail(body: unknown): string {
  if (!isRecord(body)) return "";
  const err = isRecord(body.error) ? body.error : body;
  const message = err.message ?? err.code ?? err.type;
  return typeof message === "string" ? message : "";
}

/** Any transport loss is uncertain and must never be automatically resent. */
export function classifyTransport(error: unknown, timedOut: boolean, aborted: boolean): Failure {
  if (aborted) return { kind: "aborted", message: "cancelled", retryAfterMs: null, retryable: false, outcome: "unknown", status: null };
  if (timedOut) return { kind: "timeout", message: "request timed out", retryAfterMs: null, retryable: false, outcome: "unknown", status: null };
  const message = error instanceof Error ? error.message : "network error";
  return { kind: "network", message, retryAfterMs: null, retryable: false, outcome: "unknown", status: null };
}

/** A cut-off answer is a budget problem, not a model problem - say which. */
export const TRUNCATED_MESSAGE = "the answer was cut off at the token ceiling: raise the output tokens or lower the reasoning effort";

/** `finish_reason: "length"`: the provider spent the whole completion budget. */
export function classifyTruncation(status: number | null, retryAfterMs: number | null): Failure {
  return { kind: "truncated", message: TRUNCATED_MESSAGE, retryAfterMs, retryable: false, outcome: "confirmed", status };
}
