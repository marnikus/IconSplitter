// retrypolicy.ts — the ONE retry policy for a Gemini request (RULE 10).
//
// Extracted from upload/runmetadata when the builder needed the same behaviour
// (2026-11-07): "SVG to upload" and the SVG builder must agree on what is safe to
// repeat, because the difference between them would be a difference in what the
// user is told happened.
//
// The rule is narrow on purpose. ONLY a provider-confirmed failure is repeated —
// `rate_limit` (429) and `provider` (5xx), honouring Retry-After. Everything else
// stops at once: `auth` and `payload` are the user's to fix, `malformed` means the
// provider answered nonsense, and `timeout`/`network`/`aborted` are
// OUTCOME-UNKNOWN — the request may well have been answered and billed, so
// repeating it automatically could bill twice and disclose the artwork twice.

import { sendGemini, type FetchLike, type GeminiConfig, type GeminiFailure, type GeminiUsage, type GeminiBody } from "./gemini";

export type SentOutcome = "ok" | "failed" | "cancelled";

export interface Sent {
  outcome: SentOutcome;
  text: string;
  usage: GeminiUsage;
  failure: GeminiFailure | null;
  attempts: number;
  finish: string | null;
}

export interface SendPolicyArgs {
  config: GeminiConfig;
  apiKey: string;
  request: GeminiBody;
  signal?: AbortSignal;
  fetch?: FetchLike;
  /** Injected so a test never waits. */
  sleep?: (ms: number) => Promise<void>;
}

/** The empty usage a failed or cancelled request reports (never a guessed count). */
export function emptyUsage(): GeminiUsage {
  return { input: null, output: null, total: null };
}

/** Attempt → backoff: 0.5s, 1s, 2s … capped at 30s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt);
}

/** One attempt plus the retry policy described above. */
export async function sendWithPolicy(args: SendPolicyArgs): Promise<Sent> {
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;
  for (let attempt = 0; attempt <= args.config.retries; attempt += 1) {
    if (args.signal?.aborted) return cancelledSent(attempts);
    attempts += 1;
    const out = await sendGemini({
      config: args.config, apiKey: args.apiKey, request: args.request, fetch: args.fetch, signal: args.signal,
    });
    if (out.ok) return { outcome: "ok", text: out.text, usage: out.usage, failure: null, attempts, finish: out.finish };
    if (!out.failure.retryable || attempt === args.config.retries) {
      return { outcome: "failed", text: "", usage: emptyUsage(), failure: out.failure, attempts, finish: null };
    }
    await sleep(out.failure.retryAfterMs ?? backoffMs(attempt));
  }
  return { outcome: "failed", text: "", usage: emptyUsage(), failure: null, attempts, finish: null };
}

function cancelledSent(attempts: number): Sent {
  return { outcome: "cancelled", text: "", usage: emptyUsage(), failure: null, attempts, finish: null };
}

/** Whether a failure leaves the outcome UNKNOWN (never auto-retried anywhere). */
export function isOutcomeUnknown(failure: GeminiFailure | null): boolean {
  if (failure === null) return false;
  return failure.kind === "network" || failure.kind === "timeout" || failure.kind === "provider_timeout" || failure.kind === "aborted";
}
