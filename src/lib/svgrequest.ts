// svgrequest.ts — the Requesty chat-completions call (prompt §6/§9/§14).
// Owns: the exact multimodal payload, reading tokens/cost back out of the
// response, and turning every failure mode into a classified, safe error.
// The single attempt is injectable (`fetch`) so tests exercise the real code
// path with a fake transport (RULE 8); retries and cancellation live in the
// runner, because "never retry blindly when the status is uncertain" is policy,
// not payload.

import { chatUrl, type SvgConfig } from "./svgconfig";
import { effortOf, type Effort, type ModelCaps, type SamplingParams } from "./modelcaps";
import { authHeader } from "./svgsecret";
import { isRecord } from "./isrecord";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "user";
  content: ContentPart[];
}

/**
 * The wire shape, reduced to what this build sends. `temperature`, the token
 * ceiling and `reasoning_effort` are all optional because a model may refuse
 * them — see lib/modelcaps, which is the only place that decides.
 */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: Effort;
}

export interface BuildArgs {
  model: string;
  prompt: string;
  /** Data URL of the (composite) image sent with the request. */
  image: string;
  caps: ModelCaps;
  params: SamplingParams;
}

/**
 * The documented OpenAI-compatible multimodal shape: text part + image part,
 * plus only the sampling parameters the selected model accepts. An unsupported
 * field is omitted, never sent and then rejected with a 400.
 */
export function buildChatRequest(args: BuildArgs): ChatRequest {
  const { model, prompt, image, caps, params } = args;
  const request: ChatRequest = {
    model,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }],
  };
  if (caps.temperature !== null && params.temperature !== null) request.temperature = params.temperature;
  if (params.maxTokens > 0) {
    if (caps.tokenField === "max_completion_tokens") request.max_completion_tokens = params.maxTokens;
    else request.max_tokens = params.maxTokens;
  }
  const effort = effortOf(caps, params.effort);
  if (effort !== null) request.reasoning_effort = effort;
  return request;
}

export interface Usage {
  input: number | null;
  output: number | null;
  total: number | null;
  /** Provider-reported USD cost for this request; null when not reported. */
  cost: number | null;
  currency: string;
  /** Present only on an allocated estimate — never on a provider-reported usage. */
  estimated?: number | null;
}

export const NO_USAGE: Usage = { input: null, output: null, total: null, cost: null, currency: "USD" };

/** Reads usage straight from the response — never invents a missing number. */
export function readUsage(raw: unknown): Usage {
  const usage = isRecord(raw) && isRecord(raw.usage) ? raw.usage : null;
  if (!usage) return { ...NO_USAGE };
  return {
    input: num(usage.prompt_tokens),
    output: num(usage.completion_tokens),
    total: num(usage.total_tokens),
    cost: num(usage.cost),
    currency: typeof usage.currency === "string" ? usage.currency : "USD",
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** choices[0].message.content, or null when the shape is not what we expect. */
export function readContent(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.choices) || raw.choices.length === 0) return null;
  const first: unknown = raw.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  const content = first.message.content;
  return typeof content === "string" && content.trim() !== "" ? content : null;
}

export function readRequestId(headers: HeadersLike): string | null {
  return headerOf(headers, "x-request-id") ?? headerOf(headers, "request-id");
}

export type HeadersLike = { get(name: string): string | null };

function headerOf(headers: HeadersLike | undefined, name: string): string | null {
  if (!headers) return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

/** Retry-After as milliseconds: seconds form, or an HTTP date. */
export function readRetryAfterMs(headers: HeadersLike | undefined): number | null {
  const raw = headerOf(headers, "retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export type FailKind = "auth" | "rate_limit" | "model" | "malformed" | "provider" | "network" | "timeout" | "aborted" | "payload";

export interface Failure {
  kind: FailKind;
  message: string;
  retryAfterMs: number | null;
  /** True only when we know the request produced nothing and is safe to repeat. */
  retryable: boolean;
  status: number | null;
}

/** HTTP failure → classified failure. Body text is used, never trusted raw. */
export function classifyHttp(status: number, body: unknown, retryAfterMs: number | null): Failure {
  const detail = errorDetail(body);
  const base = { status, retryAfterMs, message: `${status} ${detail}`.trim() };
  if (status === 401 || status === 403) return { ...base, kind: "auth", retryable: false };
  if (status === 429) return { ...base, kind: "rate_limit", retryable: true };
  if (status === 404 || status === 400) return { ...base, kind: isModelError(body) ? "model" : "payload", retryable: false };
  if (status === 408 || status === 504) return { ...base, kind: "timeout", retryable: false };
  if (status >= 500) return { ...base, kind: "provider", retryable: true };
  return { ...base, kind: "malformed", retryable: false };
}

function isModelError(body: unknown): boolean {
  const text = errorDetail(body).toLowerCase();
  return text.includes("model") && (text.includes("not found") || text.includes("unavailable") || text.includes("does not exist"));
}

function errorDetail(body: unknown): string {
  if (!isRecord(body)) return "";
  const err = isRecord(body.error) ? body.error : body;
  const message = err.message ?? err.code ?? err.type;
  return typeof message === "string" ? message : "";
}

/**
 * Transport failure. A timeout is deliberately NOT retryable: the provider may
 * already be generating, and blind resending would spend twice (prompt §17).
 */
export function classifyTransport(error: unknown, timedOut: boolean, aborted: boolean): Failure {
  if (aborted) return { kind: "aborted", message: "cancelled", retryAfterMs: null, retryable: false, status: null };
  if (timedOut) return { kind: "timeout", message: "request timed out", retryAfterMs: null, retryable: false, status: null };
  const message = error instanceof Error ? error.message : "network error";
  return { kind: "network", message, retryAfterMs: null, retryable: true, status: null };
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SendArgs {
  config: SvgConfig;
  apiKey: string;
  request: ChatRequest;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export type SendOut =
  | { ok: true; text: string; usage: Usage; requestId: string | null; status: number }
  | { ok: false; failure: Failure };

/** One attempt: no retry, no guessing. The caller decides what happens next. */
export async function sendChatRequest(args: SendArgs): Promise<SendOut> {
  const doFetch = args.fetch ?? defaultFetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timeout"));
  }, args.config.timeoutMs);
  const onAbort = () => controller.abort(args.signal?.reason);
  args.signal?.addEventListener("abort", onAbort);
  try {
    const response = await doFetch(chatUrl(args.config.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader(args.apiKey) },
      body: JSON.stringify(args.request),
      signal: controller.signal,
    });
    return await toOut(response);
  } catch (error) {
    const aborted = args.signal?.aborted === true;
    return { ok: false, failure: classifyTransport(error, timedOut, aborted) };
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener("abort", onAbort);
  }
}

function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

async function toOut(response: Response): Promise<SendOut> {
  const retryAfterMs = readRetryAfterMs(response.headers);
  const text = await response.text();
  if (!response.ok) return { ok: false, failure: classifyHttp(response.status, parseJson(text), retryAfterMs) };
  const body = parseJson(text);
  const content = readContent(body);
  if (content === null) {
    return { ok: false, failure: { kind: "malformed", message: "no message content in response", retryAfterMs, retryable: false, status: response.status } };
  }
  return {
    ok: true,
    text: content,
    usage: readUsage(body),
    requestId: readRequestId(response.headers),
    status: response.status,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
