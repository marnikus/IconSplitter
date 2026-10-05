// log_store.test.ts — the global log store (feature §2/§3): one module-scope
// source of truth above the tabs, a cap that governs display AND storage, and
// persistence that a restart reads back — with nothing secret in it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLogPayload } from "../src/lib/log";
import { readKey } from "../src/state/safestorage";
import {
  LOG_KEY, clearLog, flushLog, getLogState, log, resetLogStore, setLogMax, setLogMinimized, subscribeLog,
} from "../src/log/logstore";

const KEY = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const stored = () => parseLogPayload(readKey(LOG_KEY));

beforeEach(() => {
  localStorage.clear();
  resetLogStore();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  resetLogStore();
});

describe("the log store", () => {
  it("appends entries in order and notifies every subscriber", () => {
    const seen = vi.fn();
    const off = subscribeLog(seen);
    log({ feature: "app", action: "open-tab", data: { tab: "batch" } });
    log({ level: "error", feature: "svg", action: "request-failed", ids: { batch: "batch_1_4" }, detail: "500 boom" });

    const entries = getLogState().entries;
    expect(entries.map((e) => e.action)).toEqual(["open-tab", "request-failed"]);
    expect(entries[1]).toMatchObject({ level: "error", ids: { batch: "batch_1_4" }, detail: "500 boom" });
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    log({ feature: "app", action: "open-tab" });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("redacts on the way in — the store and storage never see a key or image bytes", () => {
    log({
      feature: "svg", action: "key-saved", detail: `stored ${KEY}`,
      ids: { source: "pair_1" },
      data: { apiKey: KEY, mask: "rq_live_••••••", note: `data:image/png;base64,${"A".repeat(80)}` },
    });
    flushLog();

    const e = getLogState().entries[0];
    expect(e.detail ?? "").not.toContain(KEY);
    expect(Object.keys(e.data)).not.toContain("apiKey");
    expect(String(e.data.note)).toContain("[data-url]");
    expect(readKey(LOG_KEY) ?? "").not.toContain(KEY);
    expect(readKey(LOG_KEY) ?? "").not.toContain("A".repeat(40));
  });

  it("debounces the write, then persists what the panel shows", () => {
    vi.useFakeTimers();
    log({ feature: "svg", action: "run-start" });
    expect(readKey(LOG_KEY)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(stored().entries.map((e) => e.action)).toEqual(["run-start"]);
  });

  it("keeps the newest entries within the cap, displays them, and restores them after a restart", () => {
    setLogMax(50);
    for (let i = 0; i < 60; i += 1) log({ feature: "svg", action: `step-${i}` });
    flushLog();

    expect(getLogState().entries).toHaveLength(50);
    expect(getLogState().entries[0].action).toBe("step-10");
    expect(getLogState().max).toBe(50);

    resetLogStore(); // a restart reads the stored payload back
    expect(getLogState().entries).toHaveLength(50);
    expect(getLogState().entries[49].action).toBe("step-59");
  });

  it("trims immediately when the cap shrinks, and remembers the new cap", () => {
    log({ feature: "log", action: "seed" });
    for (let i = 0; i < 120; i += 1) log({ feature: "svg", action: `step-${i}` });
    expect(getLogState().entries.length).toBeGreaterThan(100);

    setLogMax(50);

    expect(getLogState().max).toBe(50);
    expect(getLogState().entries).toHaveLength(50);
    expect(stored().max).toBe(50);
    resetLogStore();
    expect(getLogState().max).toBe(50);
  });

  it("clears to one honest entry, so the panel says the log was cleared", () => {
    log({ feature: "svg", action: "run-start" });
    clearLog();
    flushLog();

    expect(getLogState().entries.map((e) => e.action)).toEqual(["cleared"]);
    expect(getLogState().entries[0].feature).toBe("log");
    expect(stored().entries.map((e) => e.action)).toEqual(["cleared"]);
  });

  it("remembers the minimized state across a restart", () => {
    setLogMinimized(true);
    expect(getLogState().minimized).toBe(true);
    resetLogStore();
    expect(getLogState().minimized).toBe(true);
    setLogMinimized(false);
    expect(getLogState().minimized).toBe(false);
  });

  it("falls back to defaults when the stored payload is corrupt (RULE 13)", () => {
    localStorage.setItem(LOG_KEY, "{not json");
    resetLogStore();
    expect(getLogState()).toEqual({ max: 200, minimized: false, entries: [] });

    localStorage.setItem(LOG_KEY, JSON.stringify({ v: 99, max: 50, minimized: true, entries: [{ id: "x" }] }));
    resetLogStore();
    expect(getLogState()).toEqual({ max: 200, minimized: false, entries: [] });
  });
});
