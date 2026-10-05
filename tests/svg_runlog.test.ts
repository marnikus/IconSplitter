// svg_runlog.test.ts — what a generation run tells the log (log-contract.md §4,
// adapted to this branch's long-request runner). The mapping RunEvent → log
// entry is a TABLE, so the test is a table: every kind has a defined
// feature/action/level/ids/data, the data keys are all in the allow-list,
// money keeps its basis (reported vs Estimated, I-18), and nothing heavy or
// sensitive (the contact sheet, a sidecar, the prompt) can come through.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { NO_COST } from "../src/lib/svgfile";
import { LOG_DATA_KEYS } from "../src/lib/logentry";
import { getLog, resetLog } from "../src/log/logstore";
import type { RunEvent, RunSummary } from "../src/svg/runner";
import {
  logConfirmAccept, logConfirmCancel, logConfirmOpen, logRulesEdit, logRunCancel, logRunDone, logRunStart, logScan,
  runEventInput, tapRun,
} from "../src/svg/runlog";
import { summaryLine } from "../src/svg/runstate";
import type { Discovery } from "../src/svg/sources";
import { FakeStorage } from "./helpers/fakestorage";
import { RQ_KEY } from "./helpers/logfix";
import { sourcesOf } from "./helpers/svgrun";

const CTX = { run: "rabcd-1", model: "openai/gpt-6.1-sol" };
const IDS = { run: "rabcd-1", batch: "batch_1_4" };
const PAID = { input: 4100, output: 2200, total: 6300, cost: 0.021, currency: "USD" };

/** A finished request's record, as runbatch folds it (never built by hand here). */
const report = (over: Record<string, unknown> = {}) => ({
  id: "batch_1_4", index: 1, count: 4, status: "done", saved: 4, failed: 0, missing: 0,
  usage: PAID, cost: NO_COST, error: null, elapsedMs: 1200, ...over,
});

interface Row {
  name: string;
  event: RunEvent;
  want: { action: string; level: "info" | "warn" | "error"; ids: Record<string, string>; data: Record<string, unknown> };
}

const ROWS: Row[] = [
  {
    name: "batch-start",
    event: {
      kind: "batch-start", batchId: "batch_1_4", index: 1, count: 4, batches: 3, perRequest: 4,
      cols: 2, rows: 2, composite: "data:image/png;base64,AAAA", hash: "0ce4918c", startedAt: 1000,
    },
    want: { action: "batch.start", level: "info", ids: IDS, data: { count: 4, cols: 2, rows: 2, hash: "0ce4918c" } },
  },
  {
    name: "request-sent",
    event: { kind: "request-sent", batchId: "batch_1_4", attempt: 1, of: 3, hash: "0ce4918c" },
    want: { action: "request.sent", level: "info", ids: IDS, data: { attempt: 1, of: 3, hash: "0ce4918c", model: CTX.model } },
  },
  {
    name: "request-ok",
    event: { kind: "request-ok", batchId: "batch_1_4", attempt: 2, status: 200, ms: 5600, requestId: "req_9", usage: PAID },
    want: { action: "request.ok", level: "info", ids: { ...IDS, request: "req_9" }, data: { status: 200, ms: 5600, attempt: 2 } },
  },
  {
    name: "request-retry",
    event: { kind: "request-retry", batchId: "batch_1_4", attempt: 1, of: 3, failure: "rate_limit", status: 429, waitMs: 4000, error: "429 slow down" },
    want: { action: "request.retry", level: "warn", ids: IDS, data: { attempt: 1, of: 3, kind: "rate_limit", status: 429, waitMs: 4000, reason: "429 slow down" } },
  },
  {
    name: "request-failed",
    event: { kind: "request-failed", batchId: "batch_1_4", error: "503 upstream down", failure: "provider", retryAfterMs: null, count: 4, requestId: "req_7" },
    want: { action: "request.failed", level: "error", ids: { ...IDS, request: "req_7" }, data: { kind: "provider", retryAfterMs: null, count: 4, reason: "503 upstream down" } },
  },
  {
    name: "item-saved",
    event: {
      kind: "item-saved", batchId: "batch_1_4", position: 2, sourceId: "pair_fog", version: 3, icons: 1, warnings: ["a", "b"],
      usage: { ...PAID, cost: null }, sidecar: { prompt: "SECRET RULES TEXT" } as never,
    },
    want: { action: "item.saved", level: "info", ids: { ...IDS, source: "pair_fog" }, data: { position: 2, version: 3, icons: 1, warnings: 2 } },
  },
  {
    name: "item-failed",
    event: { kind: "item-failed", batchId: "batch_1_4", position: 3, sourceId: "pair_dune", error: "no SVG returned for this position", failure: "malformed", retryAfterMs: null },
    want: { action: "item.failed", level: "error", ids: { ...IDS, source: "pair_dune" }, data: { position: 3, kind: "malformed", reason: "no SVG returned for this position" } },
  },
  {
    name: "batch-done (clean)",
    event: { kind: "batch-done", report: report() as never },
    want: { action: "batch.done", level: "info", ids: IDS, data: { saved: 4, failed: 0, missing: 0 } },
  },
  {
    name: "batch-done (a failure)",
    event: { kind: "batch-done", report: report({ status: "failed", saved: 3, failed: 1, error: "boom" }) as never },
    want: { action: "batch.done", level: "warn", ids: IDS, data: { saved: 3, failed: 1, missing: 0 } },
  },
  {
    name: "batch-done (a missing result)",
    event: { kind: "batch-done", report: report({ saved: 3, missing: 1 }) as never },
    want: { action: "batch.done", level: "warn", ids: IDS, data: { saved: 3, failed: 0, missing: 1 } },
  },
  {
    name: "batch-done (outcome unknown)",
    event: { kind: "batch-done", report: report({ status: "unknown", saved: 0, failed: 4, error: "stalled" }) as never },
    want: { action: "batch.done", level: "warn", ids: IDS, data: { saved: 0, failed: 4, missing: 0 } },
  },
];

describe("runEventInput — every RunEvent kind", () => {
  it.each(ROWS)("maps $name", ({ event, want }) => {
    const out = runEventInput(event, CTX);
    expect(out).toMatchObject({ feature: "svg", action: want.action, level: want.level, ids: want.ids, data: want.data });
    expect(out?.message.length).toBeGreaterThan(5);
    for (const key of Object.keys(out?.data ?? {})) expect(LOG_DATA_KEYS.has(key), key).toBe(true);
  });

  it("has an answer for run-start, item-start and cancelled too: nothing to say", () => {
    expect(runEventInput({ kind: "run-start", batches: 2, perRequest: 4 }, CTX)).toBeNull();
    expect(runEventInput({ kind: "item-start", batchId: "b", position: 1, sourceId: "s" }, CTX)).toBeNull();
    expect(runEventInput({ kind: "cancelled" }, CTX)).toBeNull();
  });

  it("names an unknown outcome in the message, never as a plain failure", () => {
    const out = runEventInput(ROWS[10].event, CTX);
    expect(out?.message).toContain("outcome unknown");
  });

  it("leaves the request id out when the provider sent none", () => {
    const out = runEventInput({ kind: "request-ok", batchId: "b", attempt: 1, status: 200, ms: 1, requestId: null, usage: PAID }, CTX);
    expect(out?.ids).toEqual({ run: "rabcd-1", batch: "b" });
  });

  it("keeps a provider-reported cost and a calculated estimate apart, never merging them (I-18)", () => {
    const answered = runEventInput(ROWS[2].event, CTX);
    expect(answered?.usage).toEqual({ input: 4100, output: 2200, total: 6300, cost: 0.021, estimated: null, currency: "USD" });
    const share = runEventInput(ROWS[5].event, CTX);
    expect(share?.usage).toEqual({ input: 4100, output: 2200, total: 6300, cost: null, estimated: null, currency: "USD" });
  });

  it("never lets the contact sheet, a sidecar or any rules text through", () => {
    for (const row of ROWS) {
      const text = JSON.stringify(runEventInput(row.event, CTX));
      expect(text, row.name).not.toContain("data:image");
      expect(text, row.name).not.toContain("SECRET RULES TEXT");
      expect(text, row.name).not.toContain("sidecar");
    }
  });
});

describe("what a run, a confirmation and a settings change tell the log", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new FakeStorage());
    resetLog();
  });
  afterEach(() => vi.unstubAllGlobals());

  const last = () => getLog().entries[getLog().entries.length - 1];

  it("tapRun logs each event of a run with the run id", () => {
    const tap = tapRun(CTX);
    tap(ROWS[0].event);
    tap({ kind: "item-start", batchId: "b", position: 1, sourceId: "s" });
    tap(ROWS[1].event);
    expect(getLog().entries.map((e) => e.action)).toEqual(["batch.start", "request.sent"]);
    expect(getLog().entries.every((e) => e.ids.run === "rabcd-1")).toBe(true);
  });

  it("records the confirmation: open, cancel, accept (with the run)", () => {
    logConfirmOpen(5, 2);
    expect(last()).toMatchObject({ feature: "svg", action: "confirm.open", level: "info", data: { selected: 5, requests: 2 } });
    logConfirmCancel(5);
    expect(last()).toMatchObject({ action: "confirm.cancel", data: { selected: 5 } });
    logConfirmAccept("rabcd-1", 5, 2);
    expect(last()).toMatchObject({ action: "confirm.accept", ids: { run: "rabcd-1" }, data: { selected: 5, requests: 2 } });
  });

  it("records the start of a run with its limits", () => {
    logRunStart("rabcd-1", {
      sources: 5, requests: 2, model: DEFAULT_CONFIG.model, retries: DEFAULT_CONFIG.retries, timeoutMs: DEFAULT_CONFIG.timeoutMs,
    });
    expect(last()).toMatchObject({
      action: "run.start", level: "info", ids: { run: "rabcd-1" },
      data: { sources: 5, requests: 2, model: DEFAULT_CONFIG.model, retries: DEFAULT_CONFIG.retries, timeoutMs: DEFAULT_CONFIG.timeoutMs },
    });
  });

  const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
    perRequest: 4, batches: 2, saved: 4, failed: 0, missing: 0, invalid: 0, unknown: 0, cancelled: false,
    usage: { input: 10, output: 20, total: 30, cost: 0.03, currency: "USD" }, estimated: 0.01, problems: [], outcomes: [], ...over,
  });

  it("records the end of a run with the one summary line, the counts and the money kept apart", () => {
    logRunDone("rabcd-1", summary());
    expect(last()).toMatchObject({
      action: "run.done", level: "info", ids: { run: "rabcd-1" }, message: summaryLine(summary()),
      data: { saved: 4, failed: 0, missing: 0, invalid: 0, cancelled: false },
      usage: { cost: 0.03, estimated: 0.01, input: 10, output: 20, total: 30 },
    });
  });

  it.each([[{ failed: 1 }], [{ invalid: 2 }], [{ missing: 1 }], [{ cancelled: true }], [{ unknown: 1 }]])(
    "warns when a run ends with %o",
    (over) => {
      logRunDone("rabcd-1", summary(over));
      expect(last().level).toBe("warn");
    },
  );

  it("records the user's Cancel, with the run when there is one", () => {
    logRunCancel("rabcd-1");
    expect(last()).toMatchObject({ action: "run.cancel", level: "warn", ids: { run: "rabcd-1" } });
    logRunCancel(null);
    expect(last().ids).toEqual({});
  });

  it("records an edit of the rules by LENGTH and HASH — never the text", () => {
    const text = `Please make it crisp ${RQ_KEY}`;
    logRulesEdit(text);
    const e = last();
    expect(e).toMatchObject({ action: "rules.edit", level: "info", data: { chars: text.length } });
    expect(String(e.data.hash)).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(e)).not.toContain("crisp");
    expect(JSON.stringify(e)).not.toContain(RQ_KEY);
  });

  it("folds the keystrokes of one editing spell into one entry", () => {
    for (const t of ["a", "ab", "abc"]) logRulesEdit(t);
    expect(getLog().entries.filter((e) => e.action === "rules.edit")).toHaveLength(1);
    expect(last().data.chars).toBe(3);
    expect(last().repeat).toBe(3);
  });

  const found = (over: Partial<Discovery> = {}): Discovery => ({
    sources: sourcesOf(["a", "b", "c"]), problems: [], unreadable: [], corruptDecisions: false, ...over,
  });

  it("records what a scan found, and warns when it could not use something", () => {
    logScan(found());
    expect(last()).toMatchObject({ action: "scan.done", level: "info", data: { approved: 3, missing: 0, unreadable: 0, corrupt: false } });
    logScan(found({ problems: [{ id: "x" }], unreadable: [{ relPath: "y", reason: "locked" }, { relPath: "z", reason: "locked" }], corruptDecisions: true } as unknown as Partial<Discovery>));
    expect(last()).toMatchObject({ level: "warn", data: { approved: 3, missing: 1, unreadable: 2, corrupt: true } });
  });
});
