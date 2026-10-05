// svgrequest.ts — Requesty's OpenAI-compatible chat-completions request.
// Owns the multimodal payload and one timed HTTP attempt; policy/retries live
// in the runner, while JSON response semantics live in svgresponse.ts.

import { chatUrl, type SvgConfig } from "./svgconfig";
import { effortOf, type Effort, type ModelCaps, type SamplingParams } from "./modelcaps";
import { authHeader } from "./svgsecret";
import { readChatStream, type RequestClock, type StreamTiming } from "./svgstream";
import {
  classifyHttp, classifyTransport, classifyTruncation, NO_USAGE, readContent, readFinishReason,
  readRequestId, readRetryAfterMs, readUsage,
  type Failure, type Usage,
} from "./svgresponse";

export {
  classifyHttp, classifyTransport, classifyTruncation, NO_USAGE, readContent, readFinishReason,
  readRequestId, readRetryAfterMs, readUsage, TRUNCATED_MESSAGE,
} from "./svgresponse";
export type { Failure, FailKind, HeadersLike, Usage } from "./svgresponse";
export type { RequestClock } from "./svgstream";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "user";
  content: ContentPart[];
}

/** The multimodal chat payload; stream usage is requested for cost accounting. */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream: true;
  stream_options: { include_usage: true };
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

/** The selected model's capabilities decide which optional sampling fields exist. */
export function buildChatRequest(args: BuildArgs): ChatRequest {
  const { model, prompt, image, caps, params } = args;
  const request: ChatRequest = {
    model, stream: true, stream_options: { include_usage: true },
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

export interface RequestTiming extends StreamTiming {
  apiStartedAt: string;
  totalMs: number;
  transport: "sse" | "json";
}

export interface SendArgs {
  config: SvgConfig;
  apiKey: string;
  request: ChatRequest;
  fetch?: FetchLike;
  signal?: AbortSignal;
  clock?: RequestClock;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type SendOut =
  | { ok: true; text: string; usage: Usage; requestId: string | null; status: number; finishReason: string | null; timing: RequestTiming }
  | { ok: false; failure: Failure; usage: Usage | null; requestId: string | null; status: number | null; finishReason: string | null; timing: RequestTiming };

/** One attempt: it waits for a terminal response and never resubmits. */
export async function sendChatRequest(args: SendArgs): Promise<SendOut> {
  const clock = args.clock ?? systemClock;
  const startedAt = clock.now();
  const apiStartedAt = clock.iso();
  if (args.signal?.aborted) return notSent(clock, startedAt, apiStartedAt);
  return attempt({ args, clock, startedAt, apiStartedAt });
}

interface AttemptContext {
  args: SendArgs;
  clock: RequestClock;
  startedAt: number;
  apiStartedAt: string;
}

interface ResponseMeta {
  response: Response | null;
  usage: Usage | null;
  finishReason: string | null;
  timing: RequestTiming;
  requestId?: string | null;
}

interface TimingInput {
  startedAt: number;
  apiStartedAt: string;
  clock: RequestClock;
  transport: RequestTiming["transport"];
  stream?: StreamTiming;
  completionMs?: number | null;
  responseEndedMs?: number | null;
  parseMs?: number;
}

interface AttemptDeadline {
  controller: AbortController;
  timedOut: () => boolean;
  dispose: () => void;
}

function createDeadline(args: SendArgs): AttemptDeadline {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timeout"));
  }, args.config.timeoutMs);
  const onAbort = () => controller.abort(args.signal?.reason);
  args.signal?.addEventListener("abort", onAbort);
  if (args.signal?.aborted) onAbort();
  return {
    controller, timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); args.signal?.removeEventListener("abort", onAbort); },
  };
}

async function attempt(ctx: AttemptContext): Promise<SendOut> {
  if (ctx.args.signal?.aborted) return notSent(ctx.clock, ctx.startedAt, ctx.apiStartedAt);
  const deadline = createDeadline(ctx.args);
  let response: Response | null = null;
  try {
    response = await fetchResponse(ctx.args, deadline.controller);
    const out = await toOut(response, ctx.startedAt, ctx.apiStartedAt, ctx.clock);
    return reconcileDeadline(out, deadline.timedOut(), ctx.args.signal?.aborted === true);
  } catch (error) {
    return transportFailure({ error, response, ctx, timedOut: deadline.timedOut(), aborted: ctx.args.signal?.aborted === true });
  } finally {
    deadline.dispose();
  }
}

function fetchResponse(args: SendArgs, controller: AbortController): Promise<Response> {
  return (args.fetch ?? defaultFetch)(chatUrl(args.config.baseUrl), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader(args.apiKey) },
    body: JSON.stringify(args.request), signal: controller.signal,
  });
}

function reconcileDeadline(out: SendOut, timedOut: boolean, aborted: boolean): SendOut {
  if (out.ok || out.failure.outcome !== "unknown" || (!timedOut && !aborted)) return out;
  return { ...out, failure: classifyTransport(null, timedOut, aborted) };
}

function transportFailure(input: { error: unknown; response: Response | null; ctx: AttemptContext; timedOut: boolean; aborted: boolean }): SendOut {
  const failure = classifyTransport(input.error, input.timedOut, input.aborted);
  const transport = input.response && isEventStream(input.response.headers) ? "sse" : "json";
  return failed(failure, {
    response: input.response, usage: null, finishReason: null,
    timing: timing({ ...input.ctx, transport }),
  });
}

function notSent(clock: RequestClock, startedAt: number, apiStartedAt: string): SendOut {
  const failure: Failure = { kind: "aborted", message: "cancelled before sending", retryAfterMs: null, retryable: false, outcome: "confirmed", status: null };
  return { ok: false, failure, usage: null, requestId: null, status: null, finishReason: null, timing: timing({ startedAt, apiStartedAt, clock, transport: "sse" }) };
}

function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

async function toOut(response: Response, startedAt: number, apiStartedAt: string, clock: RequestClock): Promise<SendOut> {
  const stream = response.ok && isEventStream(response.headers);
  return stream
    ? toSseOut(response, startedAt, apiStartedAt, clock)
    : toJsonOut(response, startedAt, apiStartedAt, clock);
}

async function toSseOut(response: Response, startedAt: number, apiStartedAt: string, clock: RequestClock): Promise<SendOut> {
  const stream = await readChatStream(response, startedAt, clock);
  const requestId = readRequestId(response.headers);
  const used = stream.usage === null ? null : readUsage({ usage: stream.usage });
  const t = timing({ startedAt, apiStartedAt, clock, transport: "sse", stream: stream.timing });
  const meta = { response, usage: used, finishReason: stream.finishReason, timing: t, requestId };
  if (stream.transportError !== null) return failed(classifyTransport(stream.transportError, false, false), meta);
  if (!stream.terminal) return failed(incompleteFailure(response.status), meta);
  if (stream.streamError !== null) return failed(streamFailure(response.status, stream.streamError), meta);
  if (stream.malformed || stream.text.trim() === "") return failed(malformedFailure(response.status), meta);
  if (stream.finishReason === "length") return failed(classifyTruncation(response.status, null), meta);
  return { ok: true, text: stream.text, usage: used ?? { ...NO_USAGE }, requestId, status: response.status, finishReason: stream.finishReason, timing: t };
}

async function toJsonOut(response: Response, startedAt: number, apiStartedAt: string, clock: RequestClock): Promise<SendOut> {
  const text = await response.text();
  const responseEndedAt = clock.now();
  const completedMs = elapsed(startedAt, responseEndedAt);
  const parseStart = clock.now();
  const body = parseJson(text);
  const parseMs = elapsed(parseStart, clock.now());
  const t = timing({ startedAt, apiStartedAt, clock, transport: "json", completionMs: completedMs, responseEndedMs: completedMs, parseMs });
  const usage = readUsage(body);
  const finishReason = readFinishReason(body);
  const meta = { response, usage, finishReason, timing: t };
  if (!response.ok) return failed(classifyHttp(response.status, body, readRetryAfterMs(response.headers)), meta);
  if (finishReason === "length") return failed(classifyTruncation(response.status, null), meta);
  const content = readContent(body);
  if (content === null) return failed(malformedFailure(response.status), meta);
  return { ok: true, text: content, usage, requestId: readRequestId(response.headers), status: response.status, finishReason, timing: t };
}

function failed(failure: Failure, meta: ResponseMeta): SendOut {
  const requestId = meta.requestId === undefined && meta.response !== null
    ? readRequestId(meta.response.headers) : meta.requestId ?? null;
  return {
    ok: false, failure, usage: meta.usage, requestId,
    status: meta.response?.status ?? failure.status, finishReason: meta.finishReason, timing: meta.timing,
  };
}

function incompleteFailure(status: number): Failure {
  return { kind: "incomplete", message: "response ended before terminal completion", retryAfterMs: null, retryable: false, outcome: "unknown", status };
}

function malformedFailure(status: number): Failure {
  // A completed HTTP exchange can still have been billed even if its payload is unusable.
  return { kind: "malformed", message: "no valid message content in response", retryAfterMs: null, retryable: false, outcome: "unknown", status };
}

function streamFailure(status: number, message: string): Failure {
  return { kind: "provider", message, retryAfterMs: null, retryable: false, outcome: "unknown", status };
}

function isEventStream(headers: Headers): boolean {
  return headers.get("content-type")?.toLowerCase().includes("text/event-stream") === true;
}

function timing(input: TimingInput): RequestTiming {
  const stream = input.stream;
  return {
    apiStartedAt: input.apiStartedAt,
    firstEventMs: phaseValue(stream, "firstEventMs"),
    firstTokenMs: phaseValue(stream, "firstTokenMs"),
    completionMs: phaseFallback(stream, "completionMs", input.completionMs),
    responseEndedMs: phaseFallback(stream, "responseEndedMs", input.responseEndedMs),
    parseMs: parseDuration(stream, input.parseMs),
    totalMs: elapsed(input.startedAt, input.clock.now()), transport: input.transport,
  };
}

function phaseValue(stream: StreamTiming | undefined, phase: keyof StreamTiming): number | null {
  return stream === undefined ? null : stream[phase];
}

function phaseFallback(stream: StreamTiming | undefined, phase: keyof StreamTiming, fallback: number | null | undefined): number | null {
  return phaseValue(stream, phase) ?? fallback ?? null;
}

function parseDuration(stream: StreamTiming | undefined, fallback: number | undefined): number {
  return phaseValue(stream, "parseMs") ?? fallback ?? 0;
}

function elapsed(start: number, end: number): number {
  return Math.max(0, end - start);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const systemClock: RequestClock = { now: () => performance.now(), iso: () => new Date().toISOString() };
