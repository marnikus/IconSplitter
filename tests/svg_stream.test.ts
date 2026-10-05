// svg_stream.test.ts — the SSE frame parser a long generation depends on
// (RULE 8): the provider streams deltas for minutes, sends keepalive comments
// to defeat proxy idle limits, and ends with an optional usage/cost chunk plus
// [DONE]. Every assertion fails if src/lib/svgstream.ts is deleted, if the
// parser starts treating a keepalive as content, or if it swallows an error
// payload or a bad frame.
import { describe, expect, it } from "vitest";
import { feedStream, newStreamState, type StreamState } from "../src/lib/svgstream";

/** Feeds every piece in order, as the reader would. */
function feed(...chunks: string[]): StreamState {
  return chunks.reduce((state, chunk) => feedStream(state, chunk), newStreamState());
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 3411, total_tokens: 3531, cost: 0.042 } })}\n\n`;

describe("feedStream — deltas, keepalives, usage and the end of the stream", () => {
  it("concatenates delta chunks into the answer", () => {
    const s = feed(delta("<svg "), `data: ${JSON.stringify({ choices: [{ delta: { content: 'viewBox="0 0 24 24">' } }] })}\n\n`, delta("</svg>"));
    expect(s.text).toBe('<svg viewBox="0 0 24 24"></svg>');
    expect(s.frames).toBe(3);
    expect(s.done).toBe(false);
    expect(s.error).toBeNull();
  });

  it("ignores keepalive comments but counts them as liveness", () => {
    const s = feed(": keepalive\n\n", delta("A"), ": keepalive\n\n");
    expect(s.text).toBe("A");
    expect(s.keepalives).toBe(2);
    expect(s.frames).toBe(1);
  });

  it("reassembles a frame split across network chunks", () => {
    const s = feed('data: {"choices":[{"delta":{"cont', 'ent":"half"}}]}\n', "\n");
    expect(s.text).toBe("half");
    expect(s.frames).toBe(1);
  });

  it("parses several frames arriving in one chunk", () => {
    const s = feed(delta("one") + delta("two") + delta("three"));
    expect(s.text).toBe("onetwothree");
    expect(s.frames).toBe(3);
  });

  it("handles CRLF frames the way the spec allows", () => {
    const s = feed('data: {"choices":[{"delta":{"content":"crlf"}}]}\r\n\r\n');
    expect(s.text).toBe("crlf");
  });

  it("takes the usage/cost chunk that include_usage adds at the end", () => {
    const s = feed(delta("<svg/>"), usage, "data: [DONE]\n\n");
    expect(s.done).toBe(true);
    expect(s.usage.input).toBe(120);
    expect(s.usage.output).toBe(3411);
    expect(s.usage.total).toBe(3531);
    expect(s.usage.cost).toBe(0.042);
  });

  it("accepts a non-streaming message frame as content (provider that ignores stream)", () => {
    const s = feed(`data: ${JSON.stringify({ choices: [{ message: { content: "<svg/>" } }] })}\n\n`);
    expect(s.text).toBe("<svg/>");
  });

  it("reports an error payload instead of treating it as an answer", () => {
    const s = feed(delta("<svg"), `data: ${JSON.stringify({ error: { message: "upstream timed out", code: "upstream_timeout" } })}\n\n`);
    expect(s.error).toContain("upstream timed out");
  });

  it("keeps the stream's own request id when the response header had none", () => {
    const s = feed('id: chatcmpl-abc123\n\n', delta("x"));
    expect(s.requestId).toBe("chatcmpl-abc123");
    // the first id wins: later frames must not overwrite the correlation token
    expect(feedStream(s, "id: chatcmpl-later\n\n").requestId).toBe("chatcmpl-abc123");
  });

  it("counts an unreadable frame instead of throwing or swallowing it silently", () => {
    const s = feed("data: {not json\n\n", delta("ok"));
    expect(s.badFrames).toBe(1);
    expect(s.text).toBe("ok");
  });

  it("stops appending once [DONE] has arrived", () => {
    const s = feed(delta("done"), "data: [DONE]\n\n", delta("late"));
    expect(s.done).toBe(true);
    expect(s.text).toBe("done");
  });

  it("accumulates a LARGE answer frame by frame without losing or reordering a byte", () => {
    let state = newStreamState();
    const pieces = Array.from({ length: 400 }, (_, i) => `<path d="M${i} 0"/>`);
    for (const piece of pieces) state = feedStream(state, `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    state = feedStream(state, "data: [DONE]\n\n");
    expect(state.text).toBe(pieces.join(""));
    expect(state.frames).toBe(401);
    expect(state.badFrames).toBe(0);
    expect(state.done).toBe(true);
  });

  it("treats a role-only frame (the usual first frame) as no content", () => {
    const s = feed(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`, delta("body"));
    expect(s.text).toBe("body");
    expect(s.badFrames).toBe(0);
    expect(s.error).toBeNull();
  });
});
