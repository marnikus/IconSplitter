// geminifail.ts — failure classification for every Gemini call (CP-12's one
// transport shell in the making): an HTTP status or a thrown transport error
// becomes a classified failure, and only a provider-CONFIRMED failure is ever
// retryable. A disconnect or a client timeout is OUTCOME-UNKNOWN for a paid
// call and is never repeated on its own (design §5, I-20).

import { isRecord } from "../isrecord";

// --- failure classification ---------------------------------------------------

export type GeminiFailKind =
  | "auth" | "rate_limit" | "model" | "payload" | "provider" | "provider_timeout"
  | "network" | "timeout" | "aborted" | "blocked" | "malformed";

export interface GeminiFailure {
  kind: GeminiFailKind;
  message: string;
  retryAfterMs: number | null;
  /** True only for provider-CONFIRMED failures safe to repeat automatically. */
  retryable: boolean;
  status: number | null;
}

/** HTTP failure → classified failure. Body text is used, never trusted raw. */
export function classifyGeminiHttp(status: number, body: unknown, retryAfterMs: number | null): GeminiFailure {
  const detail = errorDetail(body);
  const base = { status, retryAfterMs, message: `${status} ${detail}`.trim() };
  if (status === 401 || status === 403) return { ...base, kind: "auth", retryable: false };
  if (status === 429) return { ...base, kind: "rate_limit", retryable: true };
  if (status === 404) return { ...base, kind: "model", retryable: false };
  if (status === 400) return { ...base, kind: "payload", retryable: false };
  // A confirmed provider timeout: the upstream may still be working, so the
  // request is never repeated automatically (design §5, I-20).
  if (status === 408 || status === 504) return { ...base, kind: "provider_timeout", retryable: false };
  if (status >= 500) return { ...base, kind: "provider", retryable: true };
  return { ...base, kind: "malformed", retryable: false };
}

function errorDetail(body: unknown): string {
  if (!isRecord(body)) return "";
  const err = isRecord(body.error) ? body.error : body;
  const message = err.message ?? err.code ?? err.type;
  return typeof message === "string" ? message : "";
}

/**
 * Transport failure. A disconnect or a client timeout is OUTCOME-UNKNOWN for
 * a paid call — never auto-retried (design §5: no duplicate paid submission);
 * the runner offers an explicit Retry instead.
 */
export function classifyGeminiTransport(error: unknown, state: { cancelled: boolean; timedOut: boolean }): GeminiFailure {
  if (state.cancelled) {
    return { kind: "aborted", message: "cancelled", retryAfterMs: null, retryable: false, status: null };
  }
  if (state.timedOut) {
    return { kind: "timeout", message: "the request window closed — the provider may still be working", retryAfterMs: null, retryable: false, status: null };
  }
  const message = error instanceof Error ? error.message : "network error";
  return { kind: "network", message, retryAfterMs: null, retryable: false, status: null };
}
