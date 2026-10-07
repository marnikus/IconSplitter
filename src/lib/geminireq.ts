// geminireq.ts — the Gemini generateContent call (design §7). Owns: the exact
// documented payload (text + inline PNG, JSON mode, response schema — the
// schema comes from upprompt, no second policy), the redacted confirmation
// preview, and the classification of every failure mode the design names.
// Outcome-unknown failures (network, timeout, 5xx) are NEVER auto-resubmitted;
// only rate-limit (with retry-after honoured) may retry. The single attempt is
// injectable (`fetch`) so tests exercise the real path with a fake transport
// (RULE 8); retries and cancellation are runner policy, not payload.

import { estimatedCostUsd, generateContentUrl } from "./gemconfig";
import { META_RESPONSE_SCHEMA } from "./upprompt";

export interface GeminiRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface BuildRequestArgs {
  config: { endpoint: string; model: string };
  apiKey: string;
  prompt: string;
  /** Base64 of the rendered icon preview PNG. */
  imageBase64: string;
}

export function buildGeminiRequest(a: BuildRequestArgs): GeminiRequest {
  return {
    url: generateContentUrl(a.config.endpoint, a.config.model),
    headers: { "content-type": "application/json", "x-goog-api-key": a.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: a.prompt }, { inline_data: { mime_type: "image/png", data: a.imageBase64 } }] }],
      generationConfig: { response_mime_type: "application/json", response_schema: wireSchema() },
    }),
  };
}

/** upprompt's schema in the API's uppercase enum names — one policy, two spellings. */
function wireSchema(): Record<string, unknown> {
  const s = META_RESPONSE_SCHEMA;
  return {
    type: s.type.toUpperCase(),
    properties: {
      title: { type: s.properties.title.type.toUpperCase() },
      description: { type: s.properties.description.type.toUpperCase() },
      tags: { type: s.properties.tags.type.toUpperCase(), items: { type: s.properties.tags.items.type.toUpperCase() } },
    },
    required: [...s.required],
  };
}

/** The confirmation dialog: the exact request, image and key redacted (RULE 20). */
export function describeGeminiRequest(r: GeminiRequest): string {
  const body = JSON.parse(r.body) as { contents: { parts: { inline_data?: { data: string } }[] }[] };
  const image = body.contents[0]?.parts.find((p) => p.inline_data !== undefined)?.inline_data;
  if (image !== undefined) image.data = `[${image.data.length} chars of base64 PNG — redacted]`;
  const headers = { ...r.headers, "x-goog-api-key": "[redacted]" };
  return `POST ${r.url}\n${JSON.stringify(headers, null, 2)}\n${JSON.stringify(body, null, 2)}`;
}

export type GeminiFailKind =
  | "network" | "timeout" | "rate-limit" | "refusal" | "invalid-key"
  | "bad-request" | "malformed" | "truncated" | "no-answer";

export interface GeminiFailure {
  kind: GeminiFailKind;
  message: string;
  retryAfterMs: number | null;
  /** True only for rate-limit: the design allows exactly that retry. */
  retryable: boolean;
  status: number | null;
  requestId: string | null;
}

export interface GeminiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** ALWAYS an estimate from the versioned rate card, never API-reported. */
  estimatedCostUsd: number | null;
}

export type GeminiSendOut =
  | { ok: true; text: string; usage: GeminiUsage; requestId: string | null; finishReason: string | null }
  | { ok: false; failure: GeminiFailure };

export type GeminiFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SendArgs {
  request: GeminiRequest;
  fetch: GeminiFetch;
  timeoutMs: number;
}

const REFUSAL_FINISHES = new Set(["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"]);

/** One verified attempt with a hard timeout; every outcome is classified. */
export async function sendGeminiRequest(a: SendArgs): Promise<GeminiSendOut> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, a.timeoutMs);
  try {
    const response = await a.fetch(a.request.url, {
      method: "POST",
      headers: a.request.headers,
      body: a.request.body,
      signal: controller.signal,
    });
    return await readResponse(response);
  } catch (err) {
    if (timedOut) return fail("timeout", `no answer within ${a.timeoutMs} ms — outcome unknown`, null);
    return fail("network", err instanceof Error ? err.message : "network error", null);
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse(response: Response): Promise<GeminiSendOut> {
  const text = await response.text().catch(() => null);
  if (text === null) return fail("network", "the response body never arrived — outcome unknown", response.status);
  const body: unknown = parseJson(text);
  if (body === null) {
    if (!response.ok) return httpFailure(response, text);
    return fail("malformed", "the answer was not parseable JSON", response.status);
  }
  if (!response.ok) return httpFailure(response, text, body);
  return okOutcome(body, response);
}

function okOutcome(body: unknown, response: Response): GeminiSendOut {
  const requestId = headerOf(response, "x-goog-request-id") ?? headerOf(response, "request-id");
  const record = asRecord(body);
  const feedback = asRecord(record?.promptFeedback);
  if (typeof feedback?.blockReason === "string") {
    return { ok: false, failure: refused(`the prompt was blocked: ${feedback.blockReason}`, requestId) };
  }
  const candidate = asRecord(asArray(record?.candidates)?.[0]);
  const finish = typeof candidate?.finishReason === "string" ? candidate.finishReason : null;
  if (finish !== null && REFUSAL_FINISHES.has(finish)) {
    return { ok: false, failure: refused(`the answer was refused: ${finish}`, requestId) };
  }
  if (finish === "MAX_TOKENS") {
    return { ok: false, failure: { kind: "truncated", message: "the answer hit the token ceiling — never parsed", retryAfterMs: null, retryable: false, status: response.status, requestId } };
  }
  const answer = candidateText(candidate);
  if (answer === null) {
    return { ok: false, failure: { kind: "no-answer", message: "the response carried no answer text", retryAfterMs: null, retryable: false, status: response.status, requestId } };
  }
  return { ok: true, text: answer, usage: readUsage(record), requestId, finishReason: finish };
}

function candidateText(candidate: Record<string, unknown> | null): string | null {
  const content = asRecord(candidate?.content);
  const parts = asArray(content?.parts) ?? [];
  const text = parts.map((p) => (asRecord(p)?.text ?? "")).join("");
  return text === "" ? null : text;
}

function readUsage(body: Record<string, unknown> | null): GeminiUsage {
  const u = asRecord(body?.usageMetadata);
  if (u === null) return { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null };
  const input = numberOf(u.promptTokenCount);
  const output = numberOf(u.candidatesTokenCount);
  const cost = input !== null && output !== null ? estimatedCostUsd({ input, output }) : null;
  return { inputTokens: input, outputTokens: output, totalTokens: numberOf(u.totalTokenCount), estimatedCostUsd: cost };
}

function httpFailure(response: Response, text: string, body?: unknown): GeminiSendOut {
  const requestId = headerOf(response, "x-goog-request-id") ?? headerOf(response, "request-id");
  const retryAfterMs = retryAfterMsOf(response, body);
  if (response.status === 429) {
    return { ok: false, failure: { kind: "rate-limit", message: `rate limited: ${errorDetail(body, text)}`, retryAfterMs, retryable: true, status: response.status, requestId } };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, failure: { kind: "invalid-key", message: `the API key was rejected: ${errorDetail(body, text)}`, retryAfterMs: null, retryable: false, status: response.status, requestId } };
  }
  if (response.status >= 500) {
    return { ok: false, failure: { kind: "network", message: `server error ${response.status} — outcome unknown, never auto-resubmitted`, retryAfterMs: null, retryable: false, status: response.status, requestId } };
  }
  return { ok: false, failure: { kind: "bad-request", message: `the request was rejected: ${errorDetail(body, text)}`, retryAfterMs: null, retryable: false, status: response.status, requestId } };
}

function retryAfterMsOf(response: Response, body: unknown): number | null {
  const header = headerOf(response, "retry-after");
  if (header !== null && /^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  for (const d of asArray(asRecord(asRecord(body)?.error)?.details) ?? []) {
    const delay = asRecord(d)?.retryDelay;
    if (typeof delay === "string") {
      const m = /^(\d+)s$/.exec(delay.trim());
      if (m !== null) return Number(m[1]) * 1000;
    }
  }
  return null;
}

function errorDetail(body: unknown, text: string): string {
  const message = asRecord(asRecord(body)?.error)?.message;
  return typeof message === "string" ? message : text.slice(0, 200);
}

function refused(message: string, requestId: string | null): GeminiFailure {
  return { kind: "refusal", message, retryAfterMs: null, retryable: false, status: null, requestId };
}

function fail(kind: GeminiFailKind, message: string, status: number | null): GeminiSendOut {
  return { ok: false, failure: { kind, message, retryAfterMs: null, retryable: false, status, requestId: null } };
}

function headerOf(response: Response, name: string): string | null {
  return response.headers.get(name);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
