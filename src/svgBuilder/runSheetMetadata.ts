// runSheetMetadata.ts — the ONE explicitly confirmed sheet-metadata request.
// It never retries automatically: a disconnect/timeout is outcome-unknown, and
// even a provider-confirmed retryable failure waits for a new user decision.
import {
  buildGeminiRequest, sendGemini, type FetchLike, type GeminiConfig, type GeminiUsage,
} from "../lib/upload/gemini";
import type { GeminiFailure } from "../lib/upload/geminifail";
import { draftSheetMetadata, parseSheetMetadata } from "../lib/svgBuilder/metadata";
import type { SheetMetadata } from "../lib/svgBuilder/types";

export interface GenerateSheetMetadataArgs {
  config: GeminiConfig;
  apiKey: string;
  prompt: string;
  preview: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export type SheetMetadataOutcome =
  | { ok: true; draft: SheetMetadata; usage: GeminiUsage; finish: string | null; truncated: boolean }
  | { ok: false; reason: string; failure: GeminiFailure };

export async function generateSheetMetadata(args: GenerateSheetMetadataArgs): Promise<SheetMetadataOutcome> {
  const refused = guard(args);
  if (refused !== null) return { ok: false, reason: refused, failure: refusedFailure(refused) };
  let request;
  try {
    request = buildGeminiRequest(args.prompt, args.preview);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the preview could not be attached";
    return { ok: false, reason, failure: refusedFailure(reason) };
  }
  const sent = await sendGemini({
    config: args.config, apiKey: args.apiKey, request, fetch: args.fetch, signal: args.signal,
  });
  if (!sent.ok) return { ok: false, reason: sent.failure.message, failure: sent.failure };
  try {
    const draft = draftSheetMetadata(parseSheetMetadata(sent.text));
    return { ok: true, draft, usage: sent.usage, finish: sent.finish, truncated: sent.finish === "MAX_TOKENS" || sent.finish === "LENGTH" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the provider answer could not be parsed";
    return { ok: false, reason, failure: { kind: "malformed", message: reason, retryAfterMs: null, retryable: false, status: sent.status } };
  }
}

function guard(args: GenerateSheetMetadataArgs): string | null {
  if (args.apiKey.trim() === "") return "Save the Gemini API key before generating sheet metadata";
  if (args.prompt.trim() === "") return "The sheet metadata prompt is empty";
  if (!args.preview.startsWith("data:image/")) return "A JPEG preview of the current sheet is required";
  return null;
}

function refusedFailure(reason: string): GeminiFailure {
  return { kind: "payload", message: reason, retryAfterMs: null, retryable: false, status: null };
}
