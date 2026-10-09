// runsend.ts — the wire of ONE request (prompt §3/§4/§17; long-generation prompt
// 2026-10-05): send the composite and its text, keep the provider's request id
// in the journal while the request is in flight, stream the answer, and retry
// only the failures the provider CONFIRMED. A stall is never retried — the
// upstream may still be generating and billing it. What the answer means
// (matching, saving, the outcome) stays in runbatch.ts.

import { stallHint } from "../lib/effortlimits";
import { chatUrl } from "../lib/svgconfig";
import { buildChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { sendChatStreaming } from "../lib/svgstreamread";
import { redact } from "../lib/svgsecret";
import type { BuiltComposite } from "./composite";
import { attachRequestId, beginRequest } from "./journal";
import { requestTextOf } from "./regenprompt";
import type { BatchCtx } from "./runbatch";
import type { RunState } from "./runtypes";

interface SendOk { ok: true; text: string; usage: Usage; requestId: string | null }
interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

export async function sendBatch(ctx: BatchCtx, composite: BuiltComposite): Promise<SendOk | SendBad> {
  const { state, plan, items } = ctx;
  const text = await requestTextOf(state.args, items, plan);
  if (!text.ok) return { ok: false, error: text.error, failure: "payload", retryAfterMs: null };
  ctx.recorded = text.text.record;
  const request = buildChatRequest({
    model: state.args.config.model, prompt: text.text.prompt, image: composite.dataUrl,
    caps: state.args.caps, params: state.args.params,
  });
  journalRequest(ctx);
  for (let attempt = 0; attempt <= state.args.config.retries; attempt++) {
    if (state.args.signal.aborted) return { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };
    const out = await sendChatStreaming({
      url: chatUrl(state.args.config.baseUrl), body: request, apiKey: state.args.apiKey,
      signal: state.args.signal, stallMs: state.stallMs, onId: (id) => rememberId(ctx, id),
    });
    if (out.ok) {
      // A non-streamed answer carries no stream `id:`; keep the header id it does have.
      if (out.requestId !== null && ctx.requestId === null) ctx.requestId = out.requestId;
      return { ok: true, text: out.text, usage: out.usage, requestId: ctx.requestId };
    }
    if (!out.failure.retryable || attempt === state.args.config.retries) {
      return { ok: false, error: failureText(state, out.failure, ctx), failure: out.failure.kind, retryAfterMs: out.failure.retryAfterMs };
    }
    const waitMs = out.failure.retryAfterMs ?? backoff(attempt);
    noteRetry(ctx, attempt + 1, out.failure, waitMs);
    await delay(waitMs, state.args.signal);
  }
  return { ok: false, error: "not sent", failure: "aborted", retryAfterMs: null };
}

/** The request is about to be sent: the journal names it until it has an outcome. */
function journalRequest(ctx: BatchCtx): void {
  const { state, plan, items } = ctx;
  beginRequest({
    runId: state.runId, batchId: plan.id, index: ctx.index,
    sourceIds: items.map((i) => i.id), sourceNames: items.map((i) => i.name),
    model: state.args.config.model, startedAt: new Date(ctx.startedAt).toISOString(),
  });
}

/** The id is written the moment it arrives — the journal, then the record. */
function rememberId(ctx: BatchCtx, id: string): void {
  if (ctx.requestId === null) ctx.requestId = id;
  attachRequestId(ctx.plan.id, id);
}

/** The user-facing reason: redacted; a stall names the window and the id. */
function failureText(state: RunState, failure: Failure, ctx: BatchCtx): string {
  if (failure.kind !== "stalled") return redact(failure.message, state.args.apiKey);
  const id = ctx.requestId === null ? "" : ` Provider request id: ${ctx.requestId}.`;
  return stallHint(state.args.caps, state.args.params, state.stallMs) + id;
}

/** A retry is visible in the log while its wait runs, not only in the report. */
function noteRetry(ctx: BatchCtx, attempt: number, failure: Failure, delayMs: number): void {
  ctx.state.args.onEvent({
    kind: "request-retry", batchId: ctx.plan.id, attempt,
    retries: ctx.state.args.config.retries, failure: failure.kind,
    status: failure.status, delayMs,
  });
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
