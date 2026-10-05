// send.ts — one batch request with its retries (prompt §6/§17).
// Owns: proving that the request about to be posted is the one the user
// confirmed (image slot filled, fingerprint re-measured — C-3/C-4), the attempt
// loop with its back-off, the events that narrate it, and turning the final
// failure into a redacted, classified error. Policy lives here, payload in
// lib/svgrequest: a retry is allowed only where the provider is known to have
// produced nothing (429, 5xx, transport), never after a timeout — the provider
// may already be generating.

import type { SvgConfig } from "../lib/svgconfig";
import { assertSendable, fingerprintOf, withImage, type PreparedBatch } from "../lib/svgpayload";
import { sendChatRequest, type ChatRequest, type Failure, type SendOut, type Usage } from "../lib/svgrequest";
import { redact } from "../lib/svgsecret";
import type { RunEvent } from "./runevent";

export interface SendOk { ok: true; text: string; usage: Usage; requestId: string | null; status: number }
export interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

/** What a send needs from the run — a structural subset of RunArgs. */
export interface Transport {
  config: SvgConfig;
  apiKey: string;
  signal: AbortSignal;
  onEvent: (event: RunEvent) => void;
}

/** The request as it will be posted, plus what was measured from it. */
interface Wire {
  request: ChatRequest;
  batchId: string;
  fp: string;
  chars: number;
}

interface Try {
  t: Transport;
  wire: Wire;
  attempt: number;
  of: number;
}

type Step = { done: SendOk | SendBad } | { waitMs: number };

export async function sendBatch(t: Transport, batch: PreparedBatch, dataUrl: string): Promise<SendOk | SendBad> {
  const wire = toWire(batch, dataUrl);
  if ("ok" in wire) return wire;
  const of = t.config.retries + 1;
  for (let attempt = 1; attempt <= of; attempt++) {
    if (t.signal.aborted) return bad("cancelled before sending", "aborted");
    const step = await attemptOnce({ t, wire, attempt, of });
    if ("done" in step) return step.done;
    await delay(step.waitMs, t.signal);
  }
  return bad("not sent", "aborted");
}

/** Fails closed: anything that cannot be proven identical to the confirmed request is not posted. */
function toWire(batch: PreparedBatch, dataUrl: string): Wire | SendBad {
  try {
    const request = withImage(batch.request, dataUrl);
    assertSendable(request);
    const fp = fingerprintOf(request);
    if (fp !== batch.fingerprint) return bad("request changed after confirmation — nothing was sent", "payload");
    return { request, batchId: batch.plan.id, fp, chars: JSON.stringify(request).length };
  } catch (error) {
    return bad(message(error), "payload");
  }
}

async function attemptOnce(a: Try): Promise<Step> {
  const { t, wire, attempt, of } = a;
  t.onEvent({ kind: "request-sent", batchId: wire.batchId, attempt, of, fp: wire.fp, chars: wire.chars });
  const started = Date.now();
  const out = await sendChatRequest({ config: t.config, apiKey: t.apiKey, request: wire.request, signal: t.signal });
  return out.ok ? { done: succeeded(a, out, Date.now() - started) } : settleFailure(a, out.failure);
}

function succeeded(a: Try, out: Extract<SendOut, { ok: true }>, ms: number): SendOk {
  const { text, usage, requestId, status } = out;
  a.t.onEvent({ kind: "request-ok", batchId: a.wire.batchId, attempt: a.attempt, status, ms, requestId, usage });
  return { ok: true, text, usage, requestId, status };
}

function settleFailure(a: Try, failure: Failure): Step {
  const { t, wire, attempt, of } = a;
  const error = redact(failure.message, t.apiKey);
  if (!failure.retryable || attempt === of) {
    return { done: { ok: false, error, failure: failure.kind, retryAfterMs: failure.retryAfterMs } };
  }
  const waitMs = failure.retryAfterMs ?? backoff(attempt - 1);
  t.onEvent({ kind: "request-retry", batchId: wire.batchId, attempt, of, failure: failure.kind, status: failure.status, waitMs, error });
  return { waitMs };
}

function bad(error: string, failure: Failure["kind"]): SendBad {
  return { ok: false, error, failure, retryAfterMs: null };
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt);
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
