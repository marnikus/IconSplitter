// svgtransport.ts — the fake provider every run-level suite drives (RULE 8).
// Why shared: the runner suite and the panel's queue suite must exercise the
// SAME transport — real SSE frames, a body the test pushes into, and a request
// that simply never answers — or "the panel queues while a run is in flight"
// would be proven against a different provider than "the runner streams".
// It records what each call carried: the batch's items, the effort, whether it
// streamed, and whether usage was requested.

const SVG = (name: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${name}</title>`
  + `<path d="M2 2h20v20H2z"/></svg>`;

export function requestItems(init: RequestInit): string[] {
  const body = JSON.parse(String(init.body)) as { messages: { content: { image_url?: { url: string } }[] }[] };
  const url = body.messages[0].content.find((c) => c.image_url)?.image_url?.url ?? "";
  return url.replace("data:image/png;base64,", "").split("|").filter(Boolean);
}

/** The SSE text that answers a request naming every one of its images. */
export function streamFrames(items: string[]): string {
  const blocks = items.map((relPath, i) => {
    const name = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
    return `Position ${i + 1} — ${name}\n\`\`\`svg\n${SVG(name)}\n\`\`\``;
  }).join("\n\n");
  const delta = JSON.stringify({ choices: [{ delta: { content: blocks } }] });
  const usage = JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.01 } });
  return `data: ${delta}\n\ndata: ${usage}\n\ndata: [DONE]\n\n`;
}

/** A JSON answer (the provider that ignored `stream: true`). */
export function answerFor(items: string[]): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: streamText(items) } }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.01 },
  }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1" } });
}

/** The blocks alone, for the JSON path (SSE wraps the same text in a frame). */
export function streamText(items: string[]): string {
  return items.map((relPath, i) => {
    const name = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
    return `Position ${i + 1} — ${name}\n\`\`\`svg\n${SVG(name)}\n\`\`\``;
  }).join("\n\n");
}

/** A response body the test drives itself: nothing arrives until push(). */
export interface ManualStream {
  body: ReadableStream<Uint8Array>;
  push: (...texts: string[]) => void;
  close: () => void;
}

export function manualStream(): ManualStream {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  return {
    body,
    push: (...texts: string[]) => texts.forEach((text) => ctrl.enqueue(enc.encode(text))),
    close: () => ctrl.close(),
  };
}

export function sseResponse(body: ReadableStream<Uint8Array>, requestId: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": requestId } });
}

export type Mode = "json" | "sse" | "silent" | "never";

export interface Transport {
  calls: { items: string[]; effort: string | null; stream: boolean; usage: boolean }[];
  fetch: typeof fetch;
  /** The manual bodies, one per call, for the tests that drive the stream. */
  streams: ManualStream[];
}

/**
 * Records every request. `mode` picks how each call answers: "sse" streams the
 * answer immediately, "silent" hands the test a body it must push into,
 * "json" is the provider that ignored streaming, "never" never answers.
 */
export function transport(opts: { failAt?: number; mode?: Mode | ((call: number) => Mode) } = {}): Transport {
  const calls: Transport["calls"] = [];
  const streams: ManualStream[] = [];
  const doFetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const items = requestItems(init);
    const body = JSON.parse(String(init.body)) as { reasoning_effort?: string; stream?: boolean; stream_options?: { include_usage?: boolean } };
    calls.push({ items, effort: body.reasoning_effort ?? null, stream: body.stream === true, usage: body.stream_options?.include_usage === true });
    const index = calls.length;
    const mode = typeof opts.mode === "function" ? opts.mode(index) : opts.mode ?? "sse";
    if (mode === "never") {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (opts.failAt === index) return new Response("boom", { status: 500 });
    if (mode === "json") return answerFor(items);
    const stream = manualStream();
    streams[index - 1] = stream;
    if (mode === "sse") {
      stream.push(streamFrames(items));
      stream.close();
    }
    return sseResponse(stream.body, `req_${index}`);
  };
  return { calls, fetch: doFetch as unknown as typeof fetch, streams };
}
