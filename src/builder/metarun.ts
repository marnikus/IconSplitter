// metarun.ts — one sheet-metadata request, start to finish (design §5.6).
//
// The shape mirrors upload/runmetadata, because the failure policy is the same by
// decision (Q2) and a second policy would be a second set of lies:
//
//   * a provider-CONFIRMED failure (429/5xx) is retried by `sendGemini` itself;
//   * a timeout, a disconnect or a cancel is OUTCOME-UNKNOWN — never resent
//     automatically, journalled so a restart reports `interrupted` instead of
//     guessing what happened;
//   * a blocked request is terminal;
//   * `MAX_TOKENS` is reported as truncated, and a truncated answer is NEVER
//     parsed as if it were whole;
//   * a malformed answer is terminal, and the raw text stays out of the log.
//
// What is genuinely the builder's: the request is text-only (Q1), so there is no
// image to render, and the record binds to the sheet by fingerprint.

import {
  isTruncatedFinish,
  type FetchLike, type GeminiConfig, type GeminiFailure, type GeminiUsage,
} from "../lib/upload/gemini";
import { emptyUsage, isOutcomeUnknown, sendWithPolicy } from "../lib/upload/retrypolicy";
import { parseMetadata, validateMetadata, type IconMetadata } from "../lib/upload/meta";
import { redact } from "../lib/svgsecret";
import { recordOf, type SheetMetaRecord } from "../lib/builder/metastore";
import type { SheetMetaRequest } from "../lib/builder/metarequest";

export type SheetMetaOutcome = "generated" | "invalid" | "truncated" | "failed";

export interface SheetMetaResult {
  outcome: SheetMetaOutcome;
  /** The record to store, or null when there is nothing honest to store. */
  record: SheetMetaRecord | null;
  metadata: IconMetadata | null;
  usage: GeminiUsage;
  failure: GeminiFailure | null;
  /** TRUE when the request may or may not have been answered — never retried blind. */
  outcomeUnknown: boolean;
  /** The safe, redacted one-line cause. */
  detail: string;
}

/** A journalled request whose outcome is unknown (the tab's own, not upload's). */
export interface SheetMetaJournal {
  begin: () => void;
  clear: () => void;
}

export interface SheetMetaArgs {
  request: SheetMetaRequest;
  prompt: string;
  fingerprint: string;
  config: GeminiConfig;
  apiKey: string;
  fetch?: FetchLike;
  journal?: SheetMetaJournal;
  signal?: AbortSignal;
  /** Injected so a test never waits on a backoff. */
  sleep?: (ms: number) => Promise<void>;
}

/** Sends the disclosed body and turns the answer into a storeable record. */
export async function runSheetMeta(args: SheetMetaArgs): Promise<SheetMetaResult> {
  args.journal?.begin();
  // The policy (and its retry rules) is upload's, shared — one behaviour, one story.
  const sent = await sendWithPolicy({
    config: args.config, apiKey: args.apiKey, request: args.request.body,
    fetch: args.fetch, signal: args.signal, sleep: args.sleep,
  });
  if (sent.outcome === "cancelled") return failedWith(null, args.journal, "cancelled");
  if (sent.failure !== null) return failedWith(sent.failure, args.journal);
  if (isTruncatedFinish(sent.finish)) return truncatedWith(sent.usage, args.journal);
  // The provider answered: the request is no longer in flight, whatever the text says.
  args.journal?.clear();
  return parsedOf(sent.text, sent.usage, args);
}

/** A failure: only a CONFIRMED failure is safe to call "not sent". */
function failedWith(failure: GeminiFailure | null, journal?: SheetMetaJournal, detail = ""): SheetMetaResult {
  const unknown = isOutcomeUnknown(failure);
  if (!unknown) journal?.clear();
  return {
    outcome: "failed", record: null, metadata: null, usage: emptyUsage(), failure,
    outcomeUnknown: unknown, detail: detail !== "" ? detail : redact(failure?.message ?? "the request failed"),
  };
}

/** A cut-off answer: reported as truncated, never parsed into a half record. */
function truncatedWith(usage: GeminiUsage, journal?: SheetMetaJournal): SheetMetaResult {
  journal?.clear();
  return {
    outcome: "truncated", record: null, metadata: null, usage, failure: null,
    outcomeUnknown: false, detail: "the provider ran out of tokens — the answer was truncated, never parsed as whole",
  };
}

/** The answer's text → a parsed, validated record (or a terminal "invalid"). */
function parsedOf(text: string, usage: GeminiUsage, args: SheetMetaArgs): SheetMetaResult {
  const metadata = parseMetadata(text);
  if (metadata === null) {
    return {
      outcome: "invalid", record: null, metadata: null, usage, failure: null,
      outcomeUnknown: false, detail: "the answer did not carry Title/Description/Tags lines",
    };
  }
  const validation = validateMetadata(metadata);
  const record = recordOf({
    meta: metadata, validation, prompt: args.prompt, model: args.config.model, usage,
    disclosure: { mode: args.request.disclosure.mode, chars: args.request.disclosure.chars, icons: args.request.disclosure.icons },
    fingerprint: args.fingerprint, state: validation.ok ? "generated" : "invalid",
  });
  return {
    outcome: validation.ok ? "generated" : "invalid",
    record, metadata, usage, failure: null, outcomeUnknown: false,
    detail: validation.ok ? "" : validation.errors.join("; "),
  };
}
