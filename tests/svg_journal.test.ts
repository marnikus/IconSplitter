// svg_journal.test.ts — the in-flight journal that makes a restart honest
// (RULE 8/13): a request that started is recorded with its id as soon as the
// provider gives one, removed when it finishes, and never silently resent.
// Each assertion fails if src/svg/journal.ts is deleted or stops validating
// what it reads back.
import { beforeEach, describe, expect, it } from "vitest";
import {
  attachRequestId, beginRequest, clearInflight, endRequest, inflightSummary, loadInflight, type InflightRequest,
} from "../src/svg/journal";

const KEY = "iconSplitter.svg.inflight.v1";

function record(batchId: string, sourceIds: string[]): Omit<InflightRequest, "requestId"> {
  return {
    runId: "run_1", batchId, index: 1, sourceIds, sourceNames: sourceIds.map((id) => `${id}.png`),
    model: "openai/gpt-6.1-sol", startedAt: "2026-10-05T10:00:00.000Z",
  };
}

beforeEach(() => window.localStorage.clear());

describe("journal — what was in flight when the app stopped", () => {
  it("records a request when it starts, with no id yet", () => {
    beginRequest(record("batch_1_4", ["pair_1", "pair_2"]));
    const [entry] = loadInflight();
    expect(entry.batchId).toBe("batch_1_4");
    expect(entry.sourceIds).toEqual(["pair_1", "pair_2"]);
    expect(entry.requestId).toBeNull();
    expect(entry.startedAt).toBe("2026-10-05T10:00:00.000Z");
  });

  it("attaches the provider's request id once it is known", () => {
    beginRequest(record("batch_1_4", ["pair_1"]));
    attachRequestId("batch_1_4", "chatcmpl-123");
    expect(loadInflight()[0].requestId).toBe("chatcmpl-123");
    // an unknown batch is a no-op, never a crash and never a stray entry
    attachRequestId("batch_9_9", "nope");
    expect(loadInflight()).toHaveLength(1);
  });

  it("removes the request when it finishes, and only that one", () => {
    beginRequest(record("batch_1_4", ["pair_1"]));
    beginRequest({ ...record("batch_2_4", ["pair_5"]), index: 2 });
    endRequest("batch_1_4");
    const left = loadInflight();
    expect(left.map((e) => e.batchId)).toEqual(["batch_2_4"]);
  });

  it("keeps the record on a stall — the outcome is unknown, so it must survive", () => {
    beginRequest(record("batch_2_4", ["pair_5"]));
    attachRequestId("batch_2_4", "chatcmpl-999");
    // nothing removes it: the caller only calls endRequest on a known outcome
    expect(loadInflight()).toHaveLength(1);
    expect(loadInflight()[0].requestId).toBe("chatcmpl-999");
  });

  it("replaces a repeated batch entry instead of duplicating it", () => {
    beginRequest(record("batch_1_4", ["pair_1"]));
    beginRequest(record("batch_1_4", ["pair_1"]));
    expect(loadInflight()).toHaveLength(1);
  });

  it("reads a corrupt or foreign payload as empty (RULE 13)", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadInflight()).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, requests: [{ batchId: 7 }, null, "x"] }));
    expect(loadInflight()).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify({ v: 99, requests: [record("b", ["s"])] }));
    expect(loadInflight()).toEqual([]);
  });

  it("clears everything, e.g. after the user dismisses the recovery note", () => {
    beginRequest(record("batch_1_4", ["pair_1"]));
    clearInflight();
    expect(loadInflight()).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("summarises what was interrupted for the user, ids included", () => {
    beginRequest(record("batch_1_4", ["pair_1", "pair_2"]));
    attachRequestId("batch_1_4", "chatcmpl-1");
    beginRequest({ ...record("batch_2_4", ["pair_5"]), index: 2 });
    const text = inflightSummary(loadInflight());
    expect(text).toContain("2");
    expect(text).toContain("chatcmpl-1");
    expect(text).toContain("pair_5.png");
    expect(text.toLowerCase()).toContain("unknown");
  });
});
