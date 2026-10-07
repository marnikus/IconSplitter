// geminiparse.ts — reading a GenerateContent answer, and naming exactly how it
// failed (RULE 4/13). Owns: the candidate text, the finish reason, the usage
// numbers, the refusal and truncation cases, and the HTTP/protocol error
// classes. A refusal is NOT "no metadata": it is its own outcome, so the row can
// say what happened instead of showing an empty field.

import { isRecord } from "./isrecord";
import type { GeminiUsage } from "./geminiconfig";

/** Why a request produced no usable metadata. Each kind has its own message. */
export type FailureKind =
  | "auth" | "rate-limit" | "bad-request" | "server" | "network"
  | "refusal" | "truncated" | "malformed" | "aborted";

export interface ProviderFailure {
  ok: false;
  kind: FailureKind;
  message: string;
  /** True only when re-sending cannot double-charge for a processed request. */
  resendable: boolean;
}

export interface ProviderAnswer {
  ok: true;
  text: string;
  finishReason: string;
  usage: GeminiUsage;
  /** The model version the provider answered with, when it reports one. */
  modelVersion: string | null;
  /** Provider request id, when supplied — the only correlation token we get. */
  requestId: string | null;
}

export type ProviderOutcome = ProviderAnswer | ProviderFailure;

/** HTTP status + parsed body -> the answer, or a named failure. */
export function parseGeminiResponse(status: number, body: unknown): ProviderOutcome {
  if (status !== 200) return httpFailure(status, body);
  const candidate = firstCandidate(body);
  if (candidate === null) return { ok: false, kind: "malformed", message: "the answer carried no candidate", resendable: true };
  const text = candidateText(candidate);
  const finishReason = nullableStr(candidate.finishReason) ?? "STOP";
  const failure = finishFailure(finishReason, text);
  if (failure !== null) return failure;
  if (text.trim() === "") return { ok: false, kind: "malformed", message: "the answer carried no text", resendable: true };
  return {
    ok: true, text, finishReason,
    usage: usageOf(body),
    modelVersion: nullableStr(record(body)?.modelVersion),
    requestId: nullableStr(record(body)?.responseId),
  };
}

/** A finish reason that means "there is no usable answer here". */
function finishFailure(reason: string, text: string): ProviderFailure | null {
  if (reason === "MAX_TOKENS") return { ok: false, kind: "truncated", message: "the answer was cut off at the output limit", resendable: true };
  if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT" || reason === "BLOCKLIST" || reason === "SPII") {
    return { ok: false, kind: "refusal", message: `the provider refused this image (${reason})`, resendable: false };
  }
  if (reason === "RECITATION") return { ok: false, kind: "refusal", message: "the provider withheld the answer (RECITATION)", resendable: false };
  if (reason === "MALFORMED_FUNCTION_CALL" || reason === "OTHER") {
    return text.trim() === "" ? { ok: false, kind: "malformed", message: `the answer ended as ${reason}`, resendable: true } : null;
  }
  return null;
}

/** 400/401/403/404/429/5xx, mapped to the message the user should read. */
export function httpFailure(status: number, body: unknown): ProviderFailure {
  const detail = errorMessage(body);
  if (status === 401 || status === 403) return { ok: false, kind: "auth", message: `the API key was refused (${status}${suffix(detail)})`, resendable: false };
  if (status === 429) return { ok: false, kind: "rate-limit", message: `rate limited (429${suffix(detail)})`, resendable: true };
  if (status >= 500) return { ok: false, kind: "server", message: `the provider failed (${status}${suffix(detail)}) — completion is unknown, so it was not sent again`, resendable: false };
  if (status === 400 || status === 404) return { ok: false, kind: "bad-request", message: `the request was rejected (${status}${suffix(detail)})`, resendable: false };
  return { ok: false, kind: "malformed", message: `unexpected answer (${status}${suffix(detail)})`, resendable: false };
}

function suffix(detail: string): string {
  return detail === "" ? "" : `: ${detail}`;
}

/** The provider's own message, trimmed to something a status line can hold. */
function errorMessage(body: unknown): string {
  const error = record(record(body)?.error);
  const message = nullableStr(error?.message) ?? "";
  return message.length > 140 ? `${message.slice(0, 137)}…` : message;
}

function firstCandidate(body: unknown): Record<string, unknown> | null {
  const list = record(body)?.candidates;
  if (!Array.isArray(list) || list.length === 0) return null;
  return record(list[0]);
}

/** Every text part, joined — a candidate may answer in several parts. */
function candidateText(candidate: Record<string, unknown>): string {
  const content = record(candidate.content);
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => nullableStr(record(part)?.text) ?? "").join("");
}

function usageOf(body: unknown): GeminiUsage {
  const usage = record(record(body)?.usageMetadata);
  return {
    input: numOrNull(usage?.promptTokenCount),
    output: numOrNull(usage?.candidatesTokenCount),
    total: numOrNull(usage?.totalTokenCount),
  };
}

/**
 * The answer text as JSON: structured output arrives as a JSON document, and
 * models occasionally wrap it in a fence anyway — the fence is stripped, never
 * "parsed around".
 */
export function stripJsonFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

export function parseJsonText(text: string): { ok: true; value: unknown } | ProviderFailure {
  try {
    return { ok: true, value: JSON.parse(stripJsonFence(text)) };
  } catch {
    return { ok: false, kind: "malformed", message: "the answer was not valid JSON", resendable: true };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
