// runner.ts — one batch, one request, deterministic mapping back to sources
// (spec §6-§10). Retries only rate limits; timeouts, network drops and 5xx are
// uncertain and never blind-retried (D2). Partial results are kept; cancel
// before send makes no request. Fetch is injected so tests run the real logic
// without a network (RULE 8).

import { extractSvgs, matchSvgs } from "../lib/svgextract";
import { buildChatBody, classifyStatus, parseChatResponse, type ChatUsage, type RequestFailure, type RequestyConfig } from "../lib/requesty";
import { batchOutcomes, summarise, type BatchSummary, type ItemOutcome } from "../lib/svgbatch";
import type { SvgBatch } from "../lib/svgmanifest";
import { validateSvg } from "../lib/svgvalidate";

export interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }):
    Promise<{ status: number; text: () => Promise<string> }>;
}

export interface RunResult {
  requestId: string;
  outcomes: ItemOutcome[];
  summary: BatchSummary | null;
  usage: ChatUsage | null;
  failure: RequestFailure | null;
  /** true when some saved and some not */
  partial: boolean;
  cancelled: boolean;
}

export interface RunArgs {
  batch: SvgBatch;
  cfg: RequestyConfig;
  key: string;
  prompt: string;
  imageUrl: string;
  fetchLike: FetchLike;
  signal?: AbortSignal;
}

export async function runBatch(a: RunArgs): Promise<RunResult> {
  const { batch, signal } = a;
  const base: RunResult = { requestId: newRequestId(), outcomes: [], summary: null, usage: null, failure: null, partial: false, cancelled: false };
  if (signal?.aborted) return { ...base, cancelled: true };

  const res = await send(a);
  if (res.failure) return { ...base, failure: res.failure };

  const parsed = parseChatResponse(res.body);
  if (!parsed.ok) return { ...base, failure: { kind: "malformed", retryable: false, safeMessage: parsed.reason } };

  const outcomes = batchOutcomes(batch, matchSvgs(batch.items, extractSvgs(parsed.text)), validateSvg);
  const summary = summarise(outcomes);
  return { ...base, outcomes, summary, usage: parsed.usage, partial: summary.saved > 0 && summary.saved < outcomes.length };
}

interface SendOut { body: unknown; failure: RequestFailure | null }

async function send(a: RunArgs): Promise<SendOut> {
  const { cfg, key, prompt, imageUrl, fetchLike, signal } = a;
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildChatBody(cfg, prompt, [imageUrl])),
    signal,
  };
  let attempts = 0;
  for (;;) {
    const once = await sendOnce(url, init, fetchLike, key);
    if (!once.failure || !once.failure.retryable || attempts >= cfg.retries) return once;
    attempts++;
  }
}

async function sendOnce(url: string, init: object, fetchLike: FetchLike, key: string): Promise<SendOut> {
  try {
    const res = await fetchLike(url, init as Parameters<FetchLike>[1]);
    const text = await res.text();
    if (res.status === 200) return { body: safeJson(text), failure: null };
    return { body: null, failure: classifyStatus(res.status, text, key) };
  } catch {
    return { body: null, failure: { kind: "timeout", retryable: false, safeMessage: "request did not complete — state unknown, not resubmitted" } };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let seq = 0;

function newRequestId(): string {
  seq++;
  return `r${Date.now().toString(36)}-${seq}`;
}
