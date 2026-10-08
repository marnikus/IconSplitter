// runmetadata.ts — the metadata pipeline for the "SVG to upload" tab
// (design §3.2): render a small JPEG preview of the icon, ask Gemini for
// metadata (the exact default prompt), parse + validate the answer
// deterministically, and report tokens — never a cost (Gemini reports none).
// Retries follow policy: only provider-CONFIRMED failures (429/5xx) are
// auto-retried; a timeout, disconnect or cancel is outcome-unknown and is
// NEVER resent automatically (design §5, I-20). In-flight requests are
// journalled; a restart reports them `interrupted`, never auto-resent.

import {
  DEFAULT_GEMINI_CONFIG, buildGeminiRequest, isTruncatedFinish, sendGemini,
  type FetchLike, type GeminiConfig, type GeminiFailure, type GeminiUsage,
} from "../lib/upload/gemini";
import {
  DEFAULT_METADATA_PROMPT, metadataFingerprint, parseMetadata, validateMetadata,
  type IconMetadata, type MetadataValidation,
} from "../lib/upload/meta";
import { rasterizeJpeg } from "../lib/upload/raster";
import { FLATTEN_DEFAULT } from "../lib/upload/settings";
import { PREVIEW_PX, type PreviewRender } from "../lib/upload/sentpreview";
import { redact } from "../lib/svgsecret";
import { createMemoryJournal, type MetadataJournal } from "./journal";

export { DEFAULT_METADATA_PROMPT };

/** The preview size sent to Gemini (px, square) — small, the model needs no more. */
export const PREVIEW_SIZE = PREVIEW_PX;

export type MetadataOutcome = "generated" | "invalid" | "failed" | "cancelled";

export interface MetadataResult {
  rowId: string;
  outcome: MetadataOutcome;
  metadata: IconMetadata | null;
  validation: MetadataValidation | null;
  fingerprint: string;
  usage: GeminiUsage;
  requestId: string | null;
  failure: GeminiFailure | null;
  attempts: number;
  /** The safe, redacted one-line cause (never a key, never a raw dump). */
  detail: string;
}

export interface MetadataDeps {
  fetch?: FetchLike;
  /** Renders the icon SVG to a JPEG data URL for the request (injectable). */
  render?: PreviewRender;
  journal?: MetadataJournal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface MetadataArgs {
  rowId: string;
  svgText: string;
  config?: GeminiConfig;
  apiKey: string;
  prompt?: string;
  /**
   * The preview the confirmation showed for THIS icon (design §2.4): sent
   * unchanged, so the image a human approved is the image the model receives.
   * Absent when the dialog could not prepare one — then it is rendered here.
   */
  image?: string;
  signal?: AbortSignal;
  deps?: MetadataDeps;
}

/** One icon's metadata request, end to end. */
export async function generateMetadata(args: MetadataArgs): Promise<MetadataResult> {
  const apiKey = args.apiKey.trim();
  if (apiKey === "") return failed(args.rowId, "no Gemini API key configured", null, 0);
  if (args.signal?.aborted) return cancelled(args.rowId);
  const deps = args.deps ?? {};
  const journal = deps.journal ?? createMemoryJournal();
  journal.begin({ rowId: args.rowId, startedAt: deps.now?.() ?? Date.now(), requestId: null });
  try {
    return await requestMetadata(args, apiKey, deps);
  } finally {
    journal.end(args.rowId);
  }
}

async function requestMetadata(args: MetadataArgs, apiKey: string, deps: MetadataDeps): Promise<MetadataResult> {
  try {
    const image = args.image ?? await (deps.render ?? renderPreviewDataUrl)(args.svgText, PREVIEW_SIZE);
    const request = buildGeminiRequest(args.prompt ?? DEFAULT_METADATA_PROMPT, image);
    const sent = await sendWithPolicy({ config: args.config ?? DEFAULT_GEMINI_CONFIG, apiKey, request, signal: args.signal, deps });
    if (sent.outcome === "cancelled") return cancelled(args.rowId);
    if (sent.failure !== null) {
      return failed(args.rowId, redact(sent.failure.message, apiKey), sent.failure, sent.attempts);
    }
    return interpret({ rowId: args.rowId, text: sent.text, usage: sent.usage, attempts: sent.attempts, finish: sent.finish });
  } catch (error) {
    if (args.signal?.aborted) return cancelled(args.rowId);
    return failed(args.rowId, error instanceof Error ? error.message : "unknown error", null, 0);
  }
}

/**
 * The answer → a deterministic parse + validation outcome. A provider-reported
 * LENGTH finish wins over everything the text appears to say: a half-written
 * half-written tag list that happens to parse is still a truncated answer and is NEVER
 * accepted (CP-8, RULE 4).
 */
function interpret(input: InterpretInput): MetadataResult {
  const { rowId, text, usage, attempts, finish } = input;
  if (isTruncatedFinish(finish)) return truncated(rowId, finish as string, usage, attempts);
  const parsed = parseMetadata(text);
  if (parsed === null) {
    return {
      rowId, outcome: "invalid", metadata: null, validation: null,
      fingerprint: "", usage, requestId: null, failure: null, attempts,
      detail: "the answer did not have the three labeled lines",
    };
  }
  const validation = validateMetadata(parsed);
  return {
    rowId,
    outcome: validation.ok ? "generated" : "invalid",
    metadata: parsed,
    validation,
    fingerprint: metadataFingerprint(parsed),
    usage,
    requestId: null,
    failure: null,
    attempts,
    detail: validation.ok ? "" : validation.errors.join("; "),
  };
}

/** Everything the answer → outcome step reads — one domain object (RULE 16). */
interface InterpretInput {
  rowId: string;
  text: string;
  usage: GeminiUsage;
  attempts: number;
  finish: string | null;
}

/** The provider stopped early: reported as invalid with the signal named. */
function truncated(rowId: string, finish: string, usage: GeminiUsage, attempts: number): MetadataResult {
  return {
    rowId, outcome: "invalid", metadata: null, validation: null,
    fingerprint: "", usage, requestId: null, failure: null, attempts,
    detail: `the provider stopped the answer (${finish}) — it is incomplete; ask again`,
  };
}

interface Sent {
  outcome: "ok" | "failed" | "cancelled";
  text: string;
  usage: GeminiUsage;
  failure: GeminiFailure | null;
  attempts: number;
  finish: string | null;
}

/**
 * The single attempt plus the retry policy: auto-retry ONLY provider-confirmed
 * failures (rate_limit/provider), honouring Retry-After; everything else
 * (auth, payload, timeout, network, cancel) stops immediately.
 */
async function sendWithPolicy(args: {
  config: GeminiConfig; apiKey: string; request: ReturnType<typeof buildGeminiRequest>;
  signal?: AbortSignal; deps: MetadataDeps;
}): Promise<Sent> {
  const sleep = args.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempts = 0;
  for (let i = 0; i <= args.config.retries; i++) {
    if (args.signal?.aborted) return { outcome: "cancelled", text: "", usage: emptyUsage(), failure: null, attempts, finish: null };
    attempts++;
    const out = await sendGemini({
      config: args.config, apiKey: args.apiKey, request: args.request,
      fetch: args.deps.fetch, signal: args.signal,
    });
    if (out.ok) return { outcome: "ok", text: out.text, usage: out.usage, failure: null, attempts, finish: out.finish };
    if (!out.failure.retryable || i === args.config.retries) {
      return { outcome: "failed", text: "", usage: emptyUsage(), failure: out.failure, attempts, finish: null };
    }
    await sleep(out.failure.retryAfterMs ?? backoffMs(i));
  }
  return { outcome: "failed", text: "", usage: emptyUsage(), failure: null, attempts, finish: null };
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt);
}

function emptyUsage(): GeminiUsage {
  return { input: null, output: null, total: null };
}

function cancelled(rowId: string): MetadataResult {
  return {
    rowId, outcome: "cancelled", metadata: null, validation: null,
    fingerprint: "", usage: emptyUsage(), requestId: null, failure: null, attempts: 0,
    detail: "cancelled",
  };
}

function failed(rowId: string, message: string, failure: GeminiFailure | null, attempts: number): MetadataResult {
  return {
    rowId, outcome: "failed", metadata: null, validation: null,
    fingerprint: "", usage: emptyUsage(), requestId: null, failure, attempts,
    detail: message,
  };
}

/**
 * The browser preview: the export SVG rasterized small, as a data URL. ONE
 * primitive: the dialog's preview and a runner-side re-render produce the same
 * bytes (RULE 10). The SVG carries its own background rect when a colour is
 * set; a transparent one flattens onto the same colour the JPEG does.
 */
export async function renderPreviewDataUrl(svgText: string, size: number): Promise<string> {
  const result = await rasterizeJpeg(svgText, {
    width: size, height: size, quality: 0.8, background: FLATTEN_DEFAULT,
  });
  if (!result.ok) throw new Error(result.reason);
  return blobUrl(result.jpeg);
}

function blobUrl(jpeg: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("could not encode the preview"));
    reader.readAsDataURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
  });
}
