// svg_runlog.test.ts — the SVG feature's log vocabulary (feature §3): every run
// stage, request, retry, error, token and cost reaches the global log with its
// stable ids — and the composite's data URL, which travels on the same events
// the UI needs, never does. Ported 2026-10-05 with this branch's semantics: an
// unconfirmed outcome (a stall) is a WARNING, never an error, and a request
// carries no provider-side id here, so the entry names the batch.
import { describe, expect, it } from "vitest";
import { createEntry, formatEntry } from "../src/lib/log";
import { NO_USAGE, type Usage } from "../src/lib/svgrequest";
import { batchOutcome, planBatches } from "../src/lib/svgbatch";
import { runLogSpecs } from "../src/svg/runlog";
import type { RunEvent } from "../src/svg/runtypes";

/** Assembled from parts so this test file stays free of a key literal. */
const KEY = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
const AT = "2026-10-05T12:00:00.000Z";
const IMAGE = `data:image/png;base64,${"A".repeat(120)}`;

const PLAN = planBatches(
  [{ sourceId: "pair_1", name: "icon-1_AI", relPath: "arch/icon-1_AI.png", fingerprint: "1:1" }],
  4,
)[0];

const USAGE: Usage = { input: 100, output: 200, total: 300, cost: 0.01, currency: "USD" };

const spec = (event: RunEvent) => runLogSpecs(event)[0];
/** The one line the panel shows, after the log's own redaction. */
const line = (event: RunEvent) => formatEntry(createEntry(spec(event), AT, "l1"));

const START = { kind: "batch-start", batchId: "batch_1_1", index: 1, count: 1, images: 2, batches: 2, perRequest: 4, cols: 1, rows: 1, composite: IMAGE, hash: "h1", startedAt: 0 } as const;

const STAGES: RunEvent[] = [
  { kind: "run-start", batches: 2, perRequest: 4, images: 2 },
  START,
  { kind: "item-start", batchId: "batch_1_1", position: 1, sourceId: "pair_1" },
  { kind: "item-saved", batchId: "batch_1_1", position: 1, sourceId: "pair_1", version: 2, icons: 3, warnings: [], usage: USAGE, meta: null },
  { kind: "item-failed", batchId: "batch_1_1", position: 1, sourceId: "pair_1", error: `401 with ${KEY}`, failure: "auth", retryAfterMs: null },
  { kind: "request-retry", batchId: "batch_1_1", attempt: 1, retries: 2, failure: "rate_limit", status: 429, delayMs: 2_000 },
  { kind: "request-failed", batchId: "batch_1_1", error: "500 boom", failure: "provider", retryAfterMs: null, count: 4, requestId: null },
  { kind: "cancelled" },
];

/** One finished request, done or failed or stalled. */
const done = (extra: Partial<Parameters<typeof batchOutcome>[0]> = {}): RunEvent => ({
  kind: "batch-done", done: 1, images: 1,
  report: batchOutcome({
    plan: PLAN, index: 1, model: "openai/gpt-6.1-sol", saved: 1, failed: 0, missing: 0,
    usage: USAGE, error: null, elapsedMs: 1_000, requestId: "req_1", ...extra,
  }),
});

describe("runLogSpecs — the run stages and their ids", () => {
  it("maps every run event kind to one entry of the svg feature", () => {
    for (const event of STAGES) {
      const s = spec(event);
      expect(s.feature).toBe("svg");
      expect(s.action).not.toBe("");
    }
    expect(STAGES.map((e) => spec(e).action)).toEqual([
      "run-start", "request-start", "item-start", "item-saved",
      "item-failed", "request-retry", "request-failed", "cancelled",
    ]);
  });

  it("names the counts that make a request readable", () => {
    expect(spec(STAGES[0]).data).toMatchObject({ batches: 2, perRequest: 4 });
    expect(spec(STAGES[1]).ids).toEqual({ batch: "batch_1_1" });
    expect(spec(STAGES[1]).data).toMatchObject({ request: 1, batches: 2, images: 1, grid: "1×1", composite: "h1" });
    expect(spec(STAGES[3]).data).toMatchObject({ version: 2, icons: 3, tokens: 300, cost: 0.01 });
    expect(spec(STAGES[3]).ids).toEqual({ batch: "batch_1_1", source: "pair_1" });
    expect(spec(STAGES[5]).level).toBe("warn");
    expect(spec(STAGES[5]).data).toMatchObject({ attempt: 1, retries: 2, failure: "rate_limit", status: 429, delayMs: 2_000 });
    expect(spec(STAGES[6]).level).toBe("error");
    expect(spec(STAGES[7]).level).toBe("warn");
    expect(spec(STAGES[4]).level).toBe("error");
  });

  it("never carries the composite's data URL, even though the event does", () => {
    expect(START.composite).toBe(IMAGE);
    expect(JSON.stringify(spec(START))).not.toContain("A".repeat(40));
    expect(line(START)).toContain("composite=h1");
    expect(line(START)).not.toContain("A".repeat(40));
  });

  it("redacts a key-shaped error and keeps the message", () => {
    const text = line(STAGES[4]);
    expect(text).not.toContain(KEY);
    expect(text).toContain("401");
    expect(text).toContain("•");
  });

  it("reports a finished request's tokens, cost, outcome and elapsed time", () => {
    const finished = done();
    expect(spec(finished).level).toBe("info");
    expect(spec(finished).data).toMatchObject({ request: 1, saved: 1, tokens: 300, status: "done", elapsedMs: 1_000, requestId: "req_1" });
    expect(spec(finished).ids).toEqual({ batch: "batch_1_1", request: "req_1" });
    expect(line(finished)).toContain("request 1");
    expect(line(finished)).toContain("reported");
    expect(line(finished)).toContain("0.01");
  });

  it("says how many of the run's images are done after each request (keep-alive D7)", () => {
    expect(spec(STAGES[0]).data).toMatchObject({ images: 2 });
    expect(spec(STAGES[1]).data).toMatchObject({ runImages: 2 });
    const finished = { ...done(), done: 1, images: 2 } as Extract<RunEvent, { kind: "batch-done" }>;
    expect(line(finished)).toContain("request 1 done — 1 of 2 image(s) done");
    expect(spec(finished).data).toMatchObject({ done: 1, runImages: 2 });
  });

  it("keeps a confirmed failure an error and an unconfirmed outcome a warning", () => {
    const failed = done({ saved: 0, failed: 1, usage: NO_USAGE, error: "500 boom" });
    expect(spec(failed).level).toBe("error");
    expect(line(failed)).toContain("500 boom");

    const stalled = done({ saved: 0, failed: 1, usage: NO_USAGE, error: "no output for 300s", unknown: true });
    expect(spec(stalled).level).toBe("warn");
    expect(line(stalled)).toContain("never retried");
    expect(line(stalled)).not.toContain("500 boom");
  });
});
