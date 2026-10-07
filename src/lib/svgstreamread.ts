// svgstreamread.ts — the socket half of a streamed generation (prompt
// 2026-10-05). Owns: reading the response body chunk by chunk, the STALL
// watchdog that is the only timeout this app applies, the user's cancel, and
// the decision of what the stream's ending means.
//
// There is deliberately NO total-duration limit: the stall window is reset by
// every byte (delta, keepalive comment, usage chunk), so a request that keeps
// talking runs as long as it needs while a half-open socket that fires no error
// is still caught. A stall is reported as an UNKNOWN outcome, never retried —
// the provider may still be generating and charging (RULE 4/23).
//
// Sockets and clocks live here; the byte -> state translation lives in
// lib/svgstream (pure) and the payload/error vocabulary in lib/svgrequest.

import { feedStream, newStreamState, type StreamState } from "./svgstream";
import {
  classifyHttp, classifyTransport, parseJson, readJsonResponse, readRequestId, readRetryAfterMs,
  type ChatRequest, type Failure, type FetchLike, type SendOut,
} from "./svgrequest";

export interface StreamCall {
  url: string;
  body: ChatRequest;
  apiKey: string;
  /** Injectable transport (RULE 8); defaults to the global fetch. */
  fetch?: FetchLike;
  /** The user's cancel: aborts the read and stops the stream. */
  signal?: AbortSignal;
  /** Longest silence between bytes before the connection is presumed dead. */
  stallMs: number;
  /** Called whenever bytes arrive — the UI's liveness/elapsed evidence. */
  onProgress?: (frames: number) => void;
  /** Called once, as soon as the provider's request id is known. */
  onId?: (id: string) => void;
}

export async function sendChatStreaming(call: StreamCall): Promise<SendOut> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(new Error("cancelled"));
  call.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    // The wait starts before the first byte: a connection that never answers
    // must be caught by the same window as one that goes quiet mid-stream.
    const response = await raceStall(requestStream(call, controller.signal), call.stallMs, controller);
    if (response === null) return { ok: false, failure: stalledFailure(call.stallMs) };
    if (!response.ok) return { ok: false, failure: await httpFailure(response) };
    if (!isSse(response)) return await readJsonResponse(response);
    return await pump(response, call, controller);
  } catch (error) {
    return { ok: false, failure: classifyTransport(error, { stalled: false, aborted: call.signal?.aborted === true }) };
  } finally {
    call.signal?.removeEventListener("abort", onAbort);
  }
}

function requestStream(call: StreamCall, signal: AbortSignal): Promise<Response> {
  const doFetch = call.fetch ?? ((url, init) => fetch(url, init));
  return doFetch(call.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${call.apiKey}`, Accept: "text/event-stream" },
    body: JSON.stringify(call.body),
    signal,
  });
}

/** The initial wait for response headers, raced against the stall window. */
function raceStall(work: Promise<Response>, stallMs: number, controller: AbortController): Promise<Response | null> {
  return new Promise<Response | null>((resolve) => {
    const timer = setTimeout(() => {
      controller.abort(new Error("stalled"));
      resolve(null);
    }, stallMs);
    work.then(
      (response) => { clearTimeout(timer); resolve(response); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

async function httpFailure(response: Response): Promise<Failure> {
  return classifyHttp(response.status, parseJson(await response.text()), readRetryAfterMs(response.headers));
}

function isSse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/event-stream");
}

/** Reads the events, resetting the stall window on every chunk. */
async function pump(response: Response, call: StreamCall, controller: AbortController): Promise<SendOut> {
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, failure: unsettled("the response had no readable body") };
  const headerId = readRequestId(response.headers);
  reportId(call, headerId);
  const decoder = new TextDecoder();
  let state = newStreamState();
  for (;;) {
    const step = await nextRead(reader, call.stallMs, call.signal);
    if (step.kind !== "chunk") {
      await stopReading(reader, controller);
      // A closed stream still gets judged on what it carried: [DONE] with text
      // is an answer, an early EOF is an unknown outcome.
      return step.kind === "end" ? finish(state, headerId) : { ok: false, failure: failureFor(step, call, state) };
    }
    state = absorb(state, decoder.decode(step.value, { stream: true }), call);
    // [DONE] or a provider error ends the read at once — no point waiting.
    if (state.done || state.error !== null) {
      await stopReading(reader, controller);
      return finish(state, headerId);
    }
  }
}

/** One chunk into the state, telling the caller what arrived. */
function absorb(state: StreamState, chunk: string, call: StreamCall): StreamState {
  const next = feedStream(state, chunk);
  reportId(call, next.requestId);
  call.onProgress?.(next.frames);
  return next;
}

/** Reports a stream-carried id once; the header id was already reported. */
function reportId(call: StreamCall, id: string | null): void {
  if (id !== null) call.onId?.(id);
}

type ReadOutcome = { kind: "chunk"; value: Uint8Array } | { kind: "end" } | { kind: "stalled" } | { kind: "aborted" };

/** ONE read raced against the stall window and the user's cancel. */
function nextRead(reader: ReadableStreamDefaultReader<Uint8Array>, stallMs: number, signal?: AbortSignal): Promise<ReadOutcome> {
  return new Promise<ReadOutcome>((resolve) => {
    let settled = false;
    const done = (step: ReadOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(step);
    };
    const onAbort = () => done({ kind: "aborted" });
    const timer = setTimeout(() => done({ kind: "stalled" }), stallMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => done(result.done === true ? { kind: "end" } : { kind: "chunk", value: result.value as Uint8Array }),
      () => done(signal?.aborted === true ? { kind: "aborted" } : { kind: "stalled" }),
    );
  });
}

async function stopReading(reader: ReadableStreamDefaultReader<Uint8Array>, controller: AbortController): Promise<void> {
  controller.abort(new Error("stopped"));
  try {
    await reader.cancel();
  } catch {
    /* already closed: nothing to release */
  }
}

function failureFor(step: ReadOutcome, call: StreamCall, state: StreamState): Failure {
  if (step.kind === "aborted") return { kind: "aborted", message: "cancelled", retryAfterMs: null, retryable: false, status: null };
  if (state.error !== null) return { kind: "provider", message: state.error, retryAfterMs: null, retryable: false, status: 200 };
  return stalledFailure(call.stallMs);
}

/** No byte for the stall window: the connection is presumed dead. */
function stalledFailure(stallMs: number): Failure {
  return unsettled(`no data for ${Math.round(stallMs / 1000)}s`);
}

/** The stream stopped without a completed answer: the outcome is unknown. */
function unsettled(detail: string): Failure {
  return { kind: "stalled", message: `${detail} — the connection looks dead`, retryAfterMs: null, retryable: false, status: null };
}

function finish(state: StreamState, headerId: string | null): SendOut {
  if (state.error !== null) return { ok: false, failure: { kind: "provider", message: state.error, retryAfterMs: null, retryable: false, status: 200 } };
  if (!state.done) return { ok: false, failure: unsettled("the stream ended before [DONE] — the answer may be incomplete") };
  if (state.text.trim() === "") {
    const detail = state.badFrames > 0 ? `the provider sent ${state.badFrames} unreadable frame(s)` : "the provider completed without an answer";
    return { ok: false, failure: { kind: "malformed", message: detail, retryAfterMs: null, retryable: false, status: 200 } };
  }
  return { ok: true, text: state.text, usage: state.usage, requestId: headerId ?? state.requestId, status: 200, frames: state.frames, finishReason: state.finishReason };
}
