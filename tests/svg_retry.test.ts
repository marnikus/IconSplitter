// svg_retry.test.ts — the retry loop of a generation request, driven through the
// REAL runner against a scripted fetch and fake timers (RULE 8). Written BEFORE
// the loop moved out of runner.ts (P0 of the 2026-10-01 design): it pins what
// the loop does today so the extraction is provably behaviour-preserving, and a
// timeout is provably never retried (the provider may already be generating).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import { KEY, block, failReply, okReply, runArgs, stubCanvas, stubFetchSeq } from "./helpers/svgrun";

vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...actual,
    loadImageFile: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  stubCanvas();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ANSWER = block("fog_AI");
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Starts a run and lets it reach its first post. */
async function start(over: Parameters<typeof runArgs>[0] = {}) {
  const events: RunEvent[] = [];
  const pending = runGeneration(runArgs({ ...over, onEvent: (e) => events.push(e) }));
  await tick(0);
  return { events, pending };
}

describe("the retry loop", () => {
  it("waits exactly the retry-after of a 429, then posts the identical body again", async () => {
    const calls = stubFetchSeq([failReply(429, "slow down", { "retry-after": "2" }), okReply(ANSWER)]);
    const { pending } = await start({ config: { retries: 2 } });
    expect(calls).toHaveLength(1);
    await tick(1999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toBe(calls[0].body);
    expect((await pending).saved).toBe(1);
  });

  it("backs off 500 ms and then 1 000 ms across two 503s", async () => {
    const calls = stubFetchSeq([failReply(503), failReply(503), okReply(ANSWER)]);
    const { pending } = await start({ config: { retries: 2 } });
    await tick(499);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    await tick(999);
    expect(calls).toHaveLength(2);
    await tick(1);
    expect(calls).toHaveLength(3);
    expect((await pending).saved).toBe(1);
  });

  it("posts once for a 401 and never lets the echoed key reach an event or the summary", async () => {
    const calls = stubFetchSeq([failReply(401, `Invalid key ${KEY}`)]);
    const { events, pending } = await start({ config: { retries: 2 } });
    const summary = await pending;
    expect(calls).toHaveLength(1);
    const failed = events.find((e) => e.kind === "request-failed");
    expect(failed).toMatchObject({ kind: "request-failed", failure: "auth", count: 1 });
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(summary.problems.join("\n")).not.toContain(KEY);
    expect(summary.failed).toBe(1);
  });

  it("never retries a 400: the request itself is wrong", async () => {
    const calls = stubFetchSeq([failReply(400, "bad shape")]);
    const { events, pending } = await start({ config: { retries: 2 } });
    await pending;
    expect(calls).toHaveLength(1);
    expect(events.find((e) => e.kind === "request-failed")).toMatchObject({ failure: "payload" });
  });

  it("never retries a timeout — the provider may already be generating", async () => {
    const calls = stubFetchSeq(["hang"]);
    const { events, pending } = await start({ config: { retries: 2, timeoutMs: 1000 } });
    await tick(1000);
    const summary = await pending;
    await tick(60_000);
    expect(calls).toHaveLength(1);
    expect(events.find((e) => e.kind === "request-failed")).toMatchObject({ failure: "timeout" });
    expect(summary.failed).toBe(1);
  });

  it("stops waiting when the run is cancelled and posts nothing more", async () => {
    const calls = stubFetchSeq([failReply(429, "slow down", { "retry-after": "5" }), okReply(ANSWER)]);
    const controller = new AbortController();
    const { events, pending } = await start({ config: { retries: 2 }, signal: controller.signal });
    controller.abort();
    const summary = await pending;
    expect(calls).toHaveLength(1);
    expect(summary.cancelled).toBe(true);
    expect(events.find((e) => e.kind === "request-failed")).toMatchObject({ failure: "aborted" });
  });

  it("reports one request-failed after retries + 1 posts when every attempt fails", async () => {
    const calls = stubFetchSeq([failReply(503)]);
    const { events, pending } = await start({ config: { retries: 2 } });
    await tick(1500);
    const summary = await pending;
    expect(calls).toHaveLength(3);
    expect(events.filter((e) => e.kind === "request-failed")).toHaveLength(1);
    expect(events.find((e) => e.kind === "request-failed")).toMatchObject({ failure: "provider", count: 1 });
    expect(summary).toMatchObject({ saved: 0, failed: 1 });
  });
});

describe("the events of a request", () => {
  const kinds = (events: RunEvent[]) =>
    events.map((e) => e.kind).filter((k) => k === "request-sent" || k === "request-retry" || k === "request-ok");

  it("tells sent → retry → sent → ok with attempt numbers and the wait, in that order", async () => {
    stubFetchSeq([failReply(503), okReply(ANSWER, { "x-request-id": "req_77" })]);
    const { events, pending } = await start({ config: { retries: 2 } });
    await tick(500);
    await pending;
    expect(kinds(events)).toEqual(["request-sent", "request-retry", "request-sent", "request-ok"]);
    expect(events.find((e) => e.kind === "request-retry")).toMatchObject({
      attempt: 1, of: 3, failure: "provider", status: 503, waitMs: 500,
    });
    expect(events.filter((e) => e.kind === "request-sent").map((e) => (e as { attempt: number }).attempt)).toEqual([1, 2]);
    expect(events.find((e) => e.kind === "request-ok")).toMatchObject({ attempt: 2, status: 200, requestId: "req_77" });
  });

  it("measures one fingerprint and one size for every attempt, equal to what was posted", async () => {
    const calls = stubFetchSeq([failReply(503), okReply(ANSWER)]);
    const args = runArgs({ config: { retries: 2 } });
    const events: RunEvent[] = [];
    const pending = runGeneration({ ...args, onEvent: (e) => events.push(e) });
    await tick(500);
    await pending;
    const sent = events.filter((e) => e.kind === "request-sent") as Array<Extract<RunEvent, { kind: "request-sent" }>>;
    expect(sent).toHaveLength(2);
    expect(sent[0].fp).toBe(sent[1].fp);
    expect(sent[0].fp).toBe(args.prepared.batches[0].fingerprint);
    expect(sent[0].chars).toBe(calls[0].body.length);
  });

  it("carries the retry-after of a 429 as the wait and never an echoed key", async () => {
    stubFetchSeq([failReply(429, `slow down ${KEY}`, { "retry-after": "3" }), okReply(ANSWER)]);
    const { events, pending } = await start({ config: { retries: 2 } });
    await tick(3000);
    await pending;
    const retry = events.find((e) => e.kind === "request-retry") as Extract<RunEvent, { kind: "request-retry" }>;
    expect(retry).toMatchObject({ failure: "rate_limit", status: 429, waitMs: 3000 });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });
});
