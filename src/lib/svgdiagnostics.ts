// svgdiagnostics.ts — allowlisted, local-only SVG request diagnostics.
// It deliberately has no fields for prompts, keys, images, SVGs or file paths.

import type { FailKind } from "./svgresponse";
import type { RequestTiming } from "./svgrequest";
import { redact } from "./svgsecret";

export interface SvgRequestDiagnostic {
  kind: "request";
  traceId: string;
  batchId: string;
  attempt: number;
  model: string;
  effort: string | null;
  images: number;
  maxTokens: number;
  timeoutMs: number;
  status: number | null;
  retryAfterMs: number | null;
  requestId: string | null;
  finishReason: string | null;
  failure: FailKind | null;
  error: string | null;
  outcome: "complete" | "failed" | "unknown";
  inputTokens: number | null;
  outputTokens: number | null;
  timing: RequestTiming;
}

export interface SvgParseDiagnostic {
  kind: "svg-parse";
  batchId: string;
  durationMs: number;
  blocks: number;
  matched: number;
}

export interface SvgSaveDiagnostic {
  kind: "save";
  batchId: string;
  position: number;
  durationMs: number;
  sidecarMs: number;
  outcome: "saved" | "failed";
}

export type SvgDiagnostic = SvgRequestDiagnostic | SvgParseDiagnostic | SvgSaveDiagnostic;

/** Logs only an explicit allowlist; arbitrary extra object properties are dropped. */
export function logSvgDiagnostic(record: SvgDiagnostic): void {
  console.info("[IconSplitter SVG]", JSON.stringify(safeFields(record)));
}

/** Redacts untrusted provider errors before they reach a local log or user-facing summary. */
export function safeSvgErrorText(text: string, apiKey: string, prompt: string, sourceValues: readonly string[]): string {
  let safe = redact(text, apiKey);
  const promptValue = prompt.trim();
  if (promptValue.length >= 12 && safe.includes(promptValue)) safe = safe.split(promptValue).join("[prompt omitted]");
  for (const value of sourceValues) {
    if (value.length >= 8 && safe.includes(value)) safe = safe.split(value).join("[source]");
  }
  return safe.replace(/\bdata:\S+/gi, "[image omitted]").replace(/<svg\b[\s\S]*?<\/svg>/gi, "[SVG omitted]").slice(0, 1200);
}

function safeFields(record: SvgDiagnostic): Record<string, unknown> {
  if (record.kind === "request") return safeRequestFields(record);
  if (record.kind === "svg-parse") return safeParseFields(record);
  return safeSaveFields(record);
}

function safeRequestFields(record: SvgRequestDiagnostic): Record<string, unknown> {
  return {
    kind: record.kind, traceId: record.traceId, batchId: record.batchId, attempt: record.attempt,
    model: safeModel(record.model), effort: record.effort, images: record.images, maxTokens: record.maxTokens,
    timeoutMs: record.timeoutMs, status: record.status, retryAfterMs: record.retryAfterMs, requestId: record.requestId,
    finishReason: record.finishReason, failure: record.failure, error: record.error, outcome: record.outcome,
    inputTokens: record.inputTokens, outputTokens: record.outputTokens, timing: safeTiming(record.timing),
  };
}

function safeParseFields(record: SvgParseDiagnostic): Record<string, unknown> {
  return { kind: record.kind, batchId: record.batchId, durationMs: record.durationMs, blocks: record.blocks, matched: record.matched };
}

function safeSaveFields(record: SvgSaveDiagnostic): Record<string, unknown> {
  return { kind: record.kind, batchId: record.batchId, position: record.position, durationMs: record.durationMs, sidecarMs: record.sidecarMs, outcome: record.outcome };
}

function safeTiming(timing: RequestTiming): RequestTiming {
  return {
    apiStartedAt: timing.apiStartedAt, firstEventMs: timing.firstEventMs, firstTokenMs: timing.firstTokenMs,
    completionMs: timing.completionMs, responseEndedMs: timing.responseEndedMs,
    parseMs: timing.parseMs, totalMs: timing.totalMs, transport: timing.transport,
  };
}

function safeModel(model: string): string {
  return model.slice(0, 120).replace(/[^\w./:@-]/g, "?");
}
