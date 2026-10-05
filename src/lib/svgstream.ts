// svgstream.ts — Requesty/OpenAI-compatible chat-completion SSE decoding.
// Owns only wire framing and stream timing; it never logs or persists content.

export interface RequestClock {
  now: () => number;
  iso: () => string;
}

export interface StreamTiming {
  firstEventMs: number | null;
  firstTokenMs: number | null;
  completionMs: number | null;
  responseEndedMs: number | null;
  parseMs: number;
}

export interface StreamRead {
  text: string;
  usage: unknown | null;
  finishReason: string | null;
  terminal: boolean;
  malformed: boolean;
  streamError: string | null;
  transportError: unknown | null;
  timing: StreamTiming;
}

interface StreamState extends StreamRead {
  startedAt: number;
  clock: RequestClock;
  data: string[];
}

/** Reads SSE until [DONE], a final finish_reason, EOF, or transport failure. */
export async function readChatStream(response: Response, startedAt: number, clock: RequestClock): Promise<StreamRead> {
  const state = newState(startedAt, clock);
  if (response.body === null) return { ...state, transportError: new Error("response body unavailable") };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (!state.terminal) {
      const part = await reader.read();
      if (part.done) {
        pending += decoder.decode();
        processRemainder(pending, state);
        finishFrame(state);
        endStream(state);
        break;
      }
      pending = drainLines(pending + decoder.decode(part.value, { stream: true }), state);
    }
  } catch (error) {
    state.transportError = error;
    endStream(state);
  } finally {
    if (state.terminal) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return publicState(state);
}

function newState(startedAt: number, clock: RequestClock): StreamState {
  return {
    startedAt, clock, data: [], text: "", usage: null, finishReason: null,
    terminal: false, malformed: false, streamError: null, transportError: null,
    timing: { firstEventMs: null, firstTokenMs: null, completionMs: null, responseEndedMs: null, parseMs: 0 },
  };
}

function drainLines(buffer: string, state: StreamState): string {
  let rest = buffer;
  let next = rest.indexOf("\n");
  while (next >= 0 && !state.terminal) {
    processLine(rest.slice(0, next), state);
    rest = rest.slice(next + 1);
    next = rest.indexOf("\n");
  }
  return state.terminal ? "" : rest;
}

function processRemainder(buffer: string, state: StreamState): void {
  if (buffer !== "") processLine(buffer, state);
}

function processLine(raw: string, state: StreamState): void {
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (line === "") return finishFrame(state);
  if (line.startsWith(":") || !line.startsWith("data:")) return;
  state.data.push(line.slice(5).replace(/^ /, ""));
}

function finishFrame(state: StreamState): void {
  if (state.data.length === 0) return;
  const data = state.data.join("\n");
  state.data = [];
  if (data.trim() === "[DONE]") return markTerminal(state);
  consumeJson(data, state);
}

function consumeJson(data: string, state: StreamState): void {
  const before = state.clock.now();
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    state.malformed = true;
    state.timing.parseMs += elapsed(before, state.clock.now());
    return;
  }
  state.timing.parseMs += elapsed(before, state.clock.now());
  if (!isRecord(raw)) return markMalformed(state);
  state.timing.firstEventMs ??= sinceStart(state);
  if (isRecord(raw.usage)) state.usage = raw.usage;
  if (isRecord(raw.error)) return readStreamError(raw.error, state);
  if (!Array.isArray(raw.choices)) return markMalformed(state);
  for (const value of raw.choices) if (isRecord(value)) readChoice(value, state);
}

function readChoice(choice: Record<string, unknown>, state: StreamState): void {
  if (typeof choice.finish_reason === "string") state.finishReason = choice.finish_reason;
  if (!isRecord(choice.delta) || typeof choice.delta.content !== "string") return;
  const content = choice.delta.content;
  if (content.length === 0) return;
  state.timing.firstTokenMs ??= sinceStart(state);
  state.text += content;
}

function readStreamError(error: Record<string, unknown>, state: StreamState): void {
  const detail = error.message ?? error.code ?? error.type;
  state.streamError = typeof detail === "string" ? detail.slice(0, 300) : "provider stream error";
}

function markTerminal(state: StreamState): void {
  state.terminal = true;
  state.timing.completionMs ??= sinceStart(state);
  state.timing.responseEndedMs ??= state.timing.completionMs;
}

function endStream(state: StreamState): void {
  state.timing.responseEndedMs ??= sinceStart(state);
  if (!state.terminal && state.finishReason !== null && state.transportError === null) {
    state.terminal = true;
    state.timing.completionMs = state.timing.responseEndedMs;
  }
}

function markMalformed(state: StreamState): void {
  state.malformed = true;
}

function sinceStart(state: StreamState): number {
  return elapsed(state.startedAt, state.clock.now());
}

function elapsed(start: number, end: number): number {
  return Math.max(0, end - start);
}

function publicState(state: StreamState): StreamRead {
  const { startedAt: _startedAt, clock: _clock, data: _data, ...result } = state;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
