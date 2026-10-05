// send.ts — one batch request with its retries (prompt §6/§17).
// Owns: the prompt text of a batch, the request body, the attempt loop with
// its back-off, and turning the final failure into a redacted, classified
// error. Policy lives here, payload in lib/svgrequest: a retry is allowed only
// where the provider is known to have produced nothing (429, 5xx, transport),
// never after a timeout — the provider may already be generating.

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { buildChatRequest, sendChatRequest, type Failure, type Usage } from "../lib/svgrequest";
import { redact } from "../lib/svgsecret";
import type { BuiltComposite } from "./composite";
import type { RunArgs } from "./runner";
import type { SvgSource } from "./sources";

export interface SendOk { ok: true; text: string; usage: Usage }
export interface SendBad { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null }

export async function sendBatch(args: RunArgs, plan: BatchPlan, items: SvgSource[], composite: BuiltComposite): Promise<SendOk | SendBad> {
  const manifest = batchManifest(plan.items);
  const prompt = items.length === 1 ? singlePrompt(args.prompt, items[0].stem) : batchPrompt(args.prompt, manifest);
  const request = buildChatRequest({
    model: args.config.model, prompt, image: composite.dataUrl,
    caps: args.caps, params: args.params,
  });
  for (let attempt = 0; attempt <= args.config.retries; attempt++) {
    if (args.signal.aborted) return { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };
    const out = await sendChatRequest({ config: args.config, apiKey: args.apiKey, request, signal: args.signal });
    if (out.ok) return { ok: true, text: out.text, usage: out.usage };
    if (!out.failure.retryable || attempt === args.config.retries) {
      return { ok: false, error: redact(out.failure.message, args.apiKey), failure: out.failure.kind, retryAfterMs: out.failure.retryAfterMs };
    }
    await delay(out.failure.retryAfterMs ?? backoff(attempt), args.signal);
  }
  return { ok: false, error: "not sent", failure: "aborted", retryAfterMs: null };
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
