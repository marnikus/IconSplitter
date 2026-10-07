// svgstream.ts — the Server-Sent Events parser a long generation lives on.
// Owns: turning the bytes of an OpenAI-compatible `stream: true` response into
// (a) the answer being built, (b) the usage/cost chunk that
// `stream_options.include_usage` appends, (c) the correlation id, and (d) an
// honest account of frames that could not be read. Keepalive comment lines
// (`: keepalive`) are liveness evidence, never content: they are what defeats
// the 60-100 s idle limits of the proxies in front of the provider, and a
// parser that treated them as data would corrupt every answer that outlives
// one proxy read timeout.
//
// Pure on purpose: the reader loop (lib/svgrequest) owns sockets and clocks,
// this module owns the bytes -> state translation, so both are cheap to test.

import { isRecord } from "./isrecord";
import { NO_USAGE, readUsage, type Usage } from "./svgrequest";

export interface StreamState {
  /** The tail of an unfinished frame; the next chunk completes it. */
  buffer: string;
  /** The assistant's answer so far. */
  text: string;
  /** Provider-reported tokens/cost; the last usage chunk wins. */
  usage: Usage;
  /** Correlation token: the SSE `id:` of the first frame that carried one. */
  requestId: string | null;
  /** Data frames parsed — progress/liveness, not a completeness signal. */
  frames: number;
  /** Comment frames (`: keepalive`) seen. */
  keepalives: number;
  /** Frames whose payload was not readable JSON. */
  badFrames: number;
  /** `[DONE]` seen: the provider says the answer is complete. */
  done: boolean;
  /** An error payload from the provider: a confirmed failure. */
  error: string | null;
  /**
   * The provider's finish_reason of the last choice frame. "length" is how a
   * truncated answer announces itself — the one signal that must not be guessed.
   */
  finishReason: string | null;
}

export function newStreamState(): StreamState {
  return {
    buffer: "", text: "", usage: { ...NO_USAGE }, requestId: null,
    frames: 0, keepalives: 0, badFrames: 0, done: false, error: null, finishReason: null,
  };
}

/** Feeds one network chunk; returns the new state (the input is not mutated). */
export function feedStream(state: StreamState, chunk: string): StreamState {
  if (state.done || state.error !== null) return state;
  const joined = state.buffer + chunk.replace(/\r\n?/g, "\n");
  const cut = joined.lastIndexOf("\n\n");
  if (cut < 0) return { ...state, buffer: joined };
  const frames = joined.slice(0, cut).split("\n\n").filter((f) => f.trim() !== "");
  return frames.reduce(applyFrame, { ...state, buffer: joined.slice(cut + 2) });
}

/** One complete frame: comments, fields, then the payload. */
function applyFrame(state: StreamState, frame: string): StreamState {
  const lines = frame.split("\n");
  if (lines.every((line) => line.startsWith(":"))) return { ...state, keepalives: state.keepalives + 1 };
  const data = lines.filter((line) => line.startsWith("data:")).map(payloadOf).join("\n");
  const id = lines.find((line) => line.startsWith("id:"))?.slice(3).trim() ?? "";
  const withId = id !== "" && state.requestId === null ? { ...state, requestId: id } : state;
  if (data === "") return withId;
  if (data === "[DONE]") return { ...withId, done: true, frames: withId.frames + 1 };
  return applyPayload(withId, data);
}

/** `data: {...}` / `data:{...}` / `data:  {...}` all mean the same payload. */
function payloadOf(line: string): string {
  const rest = line.slice(5);
  return rest.startsWith(" ") ? rest.slice(1) : rest;
}

function applyPayload(state: StreamState, data: string): StreamState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { ...state, frames: state.frames + 1, badFrames: state.badFrames + 1 };
  }
  const next = { ...state, frames: state.frames + 1 };
  if (isRecord(parsed) && parsed.error !== undefined) return { ...next, error: errorText(parsed.error) };
  if (isRecord(parsed) && isRecord(parsed.usage)) next.usage = readUsage(parsed);
  const reason = finishReasonOf(parsed);
  if (reason !== null) next.finishReason = reason;
  const content = frameContent(parsed);
  return content === null ? next : { ...next, text: next.text + content };
}

/** delta.content (streaming) or message.content (a provider that ignored stream). */
function frameContent(parsed: unknown): string | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.choices) || parsed.choices.length === 0) return null;
  const first: unknown = parsed.choices[0];
  if (!isRecord(first)) return null;
  const message = isRecord(first.delta) ? first.delta : isRecord(first.message) ? first.message : null;
  const content = message?.content;
  return typeof content === "string" && content !== "" ? content : null;
}

/** The finish_reason of the first choice, when the frame announces one. */
export function finishReasonOf(parsed: unknown): string | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.choices)) return null;
  const first: unknown = parsed.choices[0];
  if (!isRecord(first)) return null;
  const reason = first.finish_reason;
  return typeof reason === "string" && reason !== "" ? reason : null;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!isRecord(error)) return "the provider reported an error";
  const detail = error.message ?? error.code ?? error.type;
  return typeof detail === "string" ? detail : "the provider reported an error";
}
