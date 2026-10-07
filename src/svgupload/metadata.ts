// metadata.ts — one paid metadata request per icon, with the guard rails the
// request demands (design §8/§9). Reuse, not reinvention: the request is built by
// lib/svgrequest (the same OpenAI-compatible shape the Generate SVG tab sends),
// the socket work (streaming keepalive, stall watchdog, cancel) is
// sendChatStreaming's, the answer is parsed by lib/svgupload/metaprompt, and the
// journal records an in-flight request by its id so a crash never turns into a
// duplicate paid submission. This module owns exactly two things: the JSON
// payload we ask the model to produce, and the mapping from a transport outcome
// to a record the UI can show.

import { buildChatRequest, type ChatRequest, type Failure, type FetchLike, type SendOut } from "../lib/svgrequest";
import { sendChatStreaming } from "../lib/svgstreamread";
import { capsFor, type SamplingParams } from "../lib/modelcaps";
import {
  parseMetadataAnswer, parseMetaRecord, POLICY_ID, type MetaRecord, type MetaText,
} from "../lib/svgupload/metaprompt";
import { estimateCost } from "../lib/svgupload/provider";

export interface MetadataArgs {
  baseUrl: string;
  model: string;
  apiKey: string;
  prompt: string;
  /** The rendered icon as a data URL (image/jpeg). */
  image: string;
  params: SamplingParams;
  /** Pair identity + the source fingerprint this answer belongs to. */
  pairId: string;
  sourceFingerprint: string;
  provider: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
  stallMs: number;
  onProgress?: (frames: number) => void;
  onId?: (id: string) => void;
}

/** The exact request body, so the UI can show it verbatim before sending (§8). */
export function metadataRequest(args: Pick<MetadataArgs, "model" | "prompt" | "image" | "params">): ChatRequest {
  return buildChatRequest({
    model: args.model,
    prompt: args.prompt,
    image: args.image,
    caps: capsFor(args.model),
    params: args.params,
  });
}

export interface MetadataOut {
  record: MetaRecord;
  /** The accepted metadata, present only when the answer validated. */
  meta: MetaText | null;
  /** Set when the transport failed or the answer was refused — never a retry. */
  error: string | null;
}

/** Sends one request and turns every outcome into a record. Nothing is retried. */
export async function generateMetadata(args: MetadataArgs, now: () => string = () => new Date().toISOString()): Promise<MetadataOut> {
  const request = metadataRequest(args);
  const out = await sendChatStreaming({
    url: chatUrlOf(args.baseUrl), body: request, apiKey: args.apiKey,
    fetch: args.fetch, signal: args.signal, stallMs: args.stallMs,
    onProgress: args.onProgress, onId: args.onId,
  });
  return toRecord(out, args, now());
}

function toRecord(out: SendOut, args: MetadataArgs, now: string): MetadataOut {
  const base = recordBase(args, now);
  if (!out.ok) {
    return {
      record: { ...base, status: statusFor(out.failure), errors: [out.failure.message] },
      meta: null, error: out.failure.message,
    };
  }
  const parsed = parseMetadataAnswer({ text: out.text, finishReason: out.finishReason ?? null });
  const tokens = { input: out.usage.input, output: out.usage.output, total: out.usage.total };
  const cost = { actual: out.usage.cost, estimated: out.usage.cost === null ? estimateCost(tokens) : null, currency: out.usage.currency };
  if (!parsed.ok) {
    return {
      record: {
        ...base, status: "rejected", errors: parsed.errors, warnings: parsed.warnings,
        title: parsed.partial.title ?? "", description: parsed.partial.description ?? "", tags: parsed.partial.tags ?? [],
        requestId: out.requestId, usage: tokens, cost,
      },
      meta: null, error: parsed.errors.join(" "),
    };
  }
  return {
    record: {
      ...base, status: "accepted", title: parsed.meta.title, description: parsed.meta.description, tags: parsed.meta.tags,
      errors: [], warnings: parsed.warnings, requestId: out.requestId, usage: tokens, cost,
    },
    meta: parsed.meta, error: null,
  };
}

/**
 * How a failed request leaves the icon: a cancelled request stays "pending"
 * (nothing was sent), a transport failure is "interrupted" and needs a human
 * decision — the two cases the request names.
 */
function statusFor(failure: Failure): MetaRecord["status"] {
  if (failure.kind === "aborted") return "pending";
  if (failure.kind === "stalled" || failure.kind === "network") return "interrupted";
  return "rejected";
}

function recordBase(args: MetadataArgs, at: string): MetaRecord {
  return {
    pairId: args.pairId, title: "", description: "", tags: [], at,
    prompt: args.prompt, provider: args.provider, model: args.model, requestId: null,
    usage: { input: null, output: null, total: null },
    cost: { actual: null, estimated: null, currency: "USD" },
    status: "pending", errors: [], warnings: [], sourceFingerprint: args.sourceFingerprint,
  };
}

/** The chat endpoint this run posts to (the same rule as the Generate SVG tab). */
export function chatUrlOf(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** Re-reads a stored record, refusing junk (the panel shows "no metadata yet"). */
export function readStoredRecord(raw: unknown): MetaRecord | null {
  return parseMetaRecord(raw);
}

export { chatUrlOf as chatUrlFor, POLICY_ID };
