// geminiclient.ts — ONE metadata request, with a timeout and an honest retry
// policy (RULE 4/20). Owns: the fetch, the abort, the bounded retries, the
// attempt counter (what was actually sent, i.e. what may have been charged) and
// the decision of when re-sending is allowed.
//
// Retry rule, deliberately narrow: only a 429 is retried automatically, because
// it is the one answer that PROVES the request was not processed. A timeout, a
// dropped connection or a 5xx all leave completion UNKNOWN, and the brief is
// explicit that an uncertain submission must not be paid for twice — those end
// the item as failed/unresolved and wait for a human decision.

import {
  estimateCost, generateContentUrl, type GeminiConfig, type GeminiUsage,
} from "./geminiconfig";
import { buildRequestBody, type ImagePart } from "./geminirequest";
import { parseGeminiResponse, type ProviderOutcome } from "./geminiparse";
import { redact } from "./svgsecret";
import type { CostInfo } from "./svgmodel";

export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export interface SendArgs {
  prompt: string;
  image: ImagePart;
  config: GeminiConfig;
  key: string;
  signal?: AbortSignal;
  /** Injected for tests (RULE 8); defaults to the global fetch. */
  transport?: Transport;
  /** Injected so a retry test does not really wait. */
  wait?: (ms: number) => Promise<void>;
}

export interface SendResult {
  outcome: ProviderOutcome;
  /** HTTP requests actually sent — the only paid-work evidence we can report. */
  attempts: number;
  usage: GeminiUsage;
  cost: CostInfo;
  /** Redacted failure text for the record; "" when the answer was usable. */
  error: string;
  durationMs: number;
  /** Completion is uncertain: never re-sent automatically, only by the user. */
  unknown: boolean;
}

export const RETRY_DELAY_MS = 1_500;

/** Sends one request, retrying only what is provably safe to retry. */
export async function sendMetadata(args: SendArgs): Promise<SendResult> {
  const started = Date.now();
  const transport = args.transport ?? ((url, init) => fetch(url, init));
  let attempts = 0;
  let last: SendResult | null = null;
  for (let round = 0; round <= args.config.retries; round += 1) {
    attempts += 1;
    last = await attempt(transport, args, attempts, Date.now() - started);
    if (!shouldRetry(last, round, args.config.retries)) break;
    await (args.wait ?? wait)(RETRY_DELAY_MS * (round + 1));
  }
  return { ...(last as SendResult), attempts };
}

function shouldRetry(result: SendResult, round: number, retries: number): boolean {
  return result.outcome.ok === false && result.outcome.kind === "rate-limit" && round < retries;
}

/** One HTTP round trip: body, headers, timeout, and the parse of the answer. */
async function attempt(transport: Transport, args: SendArgs, sent: number, elapsed: number): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);
  link(args.signal, controller);
  try {
    const response = await transport(generateContentUrl(args.config.baseUrl, args.config.model), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": args.key },
      body: JSON.stringify(buildRequestBody({ prompt: args.prompt, image: args.image, config: args.config })),
      signal: controller.signal,
    });
    const outcome = parseGeminiResponse(response.status, await readJson(response));
    return result(outcome, sent, Date.now() - elapsed);
  } catch (error) {
    return result(failureFrom(error, args.config.timeoutMs), sent, Date.now() - elapsed);
  } finally {
    clearTimeout(timer);
  }
}

/** A thrown fetch/abort becomes a named failure — never an empty catch. */
function failureFrom(error: unknown, timeoutMs: number): ProviderOutcome {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || /abort/i.test(String(error))) {
    return { ok: false, kind: "network", message: `the request timed out after ${Math.round(timeoutMs / 1000)} s — completion is unknown`, resendable: false };
  }
  return { ok: false, kind: "network", message: "the network request failed — completion is unknown", resendable: false };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null; // a body we cannot read is handled as "no candidate", with the status
  }
}

function result(outcome: ProviderOutcome, attempts: number, durationMs: number): SendResult {
  const usage = outcome.ok ? outcome.usage : { input: null, output: null, total: null };
  return {
    outcome,
    attempts,
    usage,
    cost: estimateCost(usage),
    error: outcome.ok ? "" : redact(outcome.message),
    durationMs,
    unknown: outcome.ok ? false : !outcome.resendable,
  };
}

/** Cancels the in-flight attempt when the caller aborts (cancel must be fast). */
function link(signal: AbortSignal | undefined, controller: AbortController): void {
  if (signal === undefined) return;
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", () => controller.abort(), { once: true });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
