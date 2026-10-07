// generate.ts — one paid metadata request per icon (RULE 9). Owns: rendering the
// icon for the model, sending the editable prompt, and turning the answer into
// either an accepted record or a classified failure.
//
// The image sent is a real raster of the prepared export copy — the same plate,
// padding and strokes the export will use — so what the model describes and what
// the package contains cannot drift apart. The prompt is never rewritten here:
// `finalPrompt` is exactly what the panel showed the user.

import { modelLabel, type GeminiConfig, type GeminiUsage } from "../lib/geminiconfig";
import { sendMetadata, type SendResult, type Transport } from "../lib/geminiclient";
import { parseJsonText, type ProviderOutcome } from "../lib/geminiparse";
import { metadataFromJson, parseMetadataText, validateMetadata, type MetadataCheck, type MetadataRecord } from "../lib/uploadmeta";
import { finalPrompt } from "../lib/uploadprompt";
import { documentBounds } from "../lib/uploadbounds";
import { pixelSize, prepareSvg } from "../lib/uploadartboard";
import { rasterize, type RasterDeps } from "../lib/uploadraster";
import { redact } from "../lib/svgsecret";
import type { UploadSettings } from "../lib/uploadsettings";
import type { CostInfo } from "../lib/svgmodel";

/** The preview sent to the model: small enough to be cheap, large enough to read. */
export const REQUEST_MP = 0.3;

export interface GenerateContext {
  provider: GeminiConfig;
  key: string;
  prompt: string;
  raster: RasterDeps;
  signal: AbortSignal;
  transport?: Transport;
  wait?: (ms: number) => Promise<void>;
}

export interface GeneratedMetadata {
  record: MetadataRecord | null;
  check: MetadataCheck | null;
  /** Redacted, actionable text; null when the answer was usable. */
  error: string | null;
  warnings: string[];
  /** What the provider really reported, never a guess. */
  usage: GeminiUsage;
  cost: CostInfo;
  requestId: string | null;
  model: string;
  /** True when the completion is uncertain: it is never re-sent automatically. */
  unknown: boolean;
}

/** Renders the icon, asks the provider, and validates what came back. */
export async function generateFor(code: string, settings: UploadSettings, ctx: GenerateContext): Promise<GeneratedMetadata> {
  const image = await renderForRequest(code, settings, ctx);
  if (!image.ok) return failed(image.error);
  const sent = await sendMetadata({
    prompt: finalPrompt(ctx.prompt, ctx.provider.structured),
    image: { mimeType: "image/jpeg", base64: image.base64 },
    config: ctx.provider,
    key: ctx.key,
    signal: ctx.signal,
    transport: ctx.transport,
    wait: ctx.wait,
  });
  if (!sent.outcome.ok) return failureOf(sent, `${sent.outcome.kind}: ${sent.outcome.message}`);
  return accept(readAnswer(sent.outcome, ctx.provider.structured), sent);
}

/** Structured output is JSON; a text answer is the labelled three-line form. */
function readAnswer(outcome: ProviderOutcome, structured: boolean): ReturnType<typeof parseMetadataText> {
  if (!outcome.ok) return { ok: false, record: null, errors: [outcome.message], labelled: false };
  if (!structured) return parseMetadataText(outcome.text);
  const json = parseJsonText(outcome.text);
  return json.ok ? metadataFromJson(json.value) : { ok: false, record: null, errors: [json.message], labelled: false };
}

function accept(answer: ReturnType<typeof parseMetadataText>, sent: SendResult): GeneratedMetadata {
  if (!answer.ok || answer.record === null) return failureOf(sent, answer.errors.join("; "));
  const check = validateMetadata(answer.record);
  return {
    record: answer.record,
    check,
    error: check.ok ? null : check.errors.join("; "),
    warnings: check.warnings,
    usage: sent.usage,
    cost: sent.cost,
    requestId: sent.outcome.ok ? sent.outcome.requestId : null,
    model: sent.outcome.ok ? (sent.outcome.modelVersion ?? modelLabel("")) : "",
    unknown: sent.unknown,
  };
}

function failureOf(sent: SendResult, error: string): GeneratedMetadata {
  return {
    record: null, check: null,
    // A provider message can quote the request; the key must never survive it.
    error: redact(error, ""),
    warnings: [],
    usage: sent.usage,
    cost: sent.cost,
    requestId: sent.outcome.ok ? sent.outcome.requestId : null,
    model: sent.outcome.ok ? (sent.outcome.modelVersion ?? "") : "",
    unknown: sent.unknown,
  };
}

function failed(error: string): GeneratedMetadata {
  return {
    record: null, check: null, error, warnings: [],
    usage: { input: null, output: null, total: null },
    cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
    requestId: null, model: "", unknown: false,
  };
}

interface RenderedImage { ok: boolean; base64: string; error: string }

/** The rendered icon the model sees: the prepared copy, at REQUEST_MP. */
async function renderForRequest(code: string, settings: UploadSettings, ctx: GenerateContext): Promise<RenderedImage> {
  const bounds = documentBounds(code);
  if (!bounds.ok || bounds.bounds === null) return { ok: false, base64: "", error: bounds.error ?? "the artwork cannot be measured" };
  const prepared = prepareSvg(code, bounds.bounds, settings);
  if (!prepared.ok || prepared.artboard === null) return { ok: false, base64: "", error: prepared.error ?? "the export copy could not be prepared" };
  const view = prepared.artboard.viewBox;
  const aspect = view.w / view.h;
  const px = pixelSize(aspect, REQUEST_MP);
  const rendered = await rasterize({ svg: prepared.code, px, background: settings.background, quality: 0.85 }, ctx.raster);
  if (!rendered.ok || rendered.blob === null) return { ok: false, base64: "", error: rendered.error ?? "the preview could not be rendered" };
  return { ok: true, base64: bytesToBase64(new Uint8Array(await rendered.blob.arrayBuffer())), error: "" };
}

/** Base64 without a data-URL prefix: what `inlineData` wants. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
