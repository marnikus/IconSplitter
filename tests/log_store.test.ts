// log_store.test.ts — the log's memory, its storage and its facade (log-contract.md
// §6–§8, invariants L-1/L-2/L-6/L-9) against the REAL store, an in-memory Storage (helpers/fakestorage)
// of this DOM and fake timers (RULE 8). The clock is moved with setSystemTime so a
// loop of thousands of appends does not also fire thousands of debounce timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLog, serializeLog } from "../src/lib/logentry";
import { formatAll } from "../src/lib/logformat";
import { FLOOD_MAX } from "../src/lib/logbuffer";
import { MAX_CHOICES, serializeLogPrefs } from "../src/lib/logprefs";
import { bootLog, resetBoot } from "../src/log/boot";
import { log, logStatus, logger, newId } from "../src/log/logger";
import { BYTE_BUDGET, LOG_KEY, PREFS_KEY } from "../src/log/logstorage";
import { clearLog, copyAllText, flushLog, getLog, hydrate, resetLog, setMax, setMinimized, subscribeLog } from "../src/log/logstore";
import { forgetSecret, watchSecret } from "../src/log/secrets";
import { FakeStorage } from "./helpers/fakestorage";
import { AT, PLAIN_SECRET, RQ_KEY, entries, entry, input } from "./helpers/logfix";

const T0 = Date.parse(AT);
let disk: FakeStorage;
const stored = () => parseLog(disk.getItem(LOG_KEY));
const advance = (ms = 20) => vi.setSystemTime(Date.now() + ms);
const messages = () => getLog().entries.map((e) => e.message);

/** n distinct entries, one per 20 ms, so neither fold nor the flood guard touches them. */
function logMany(n: number, text: (i: number) => string = (i) => `message ${i}`): void {
  for (let i = 1; i <= n; i++) {
    log(input({ message: text(i) }));
    advance();
  }
}

beforeEach(() => {
  disk = new FakeStorage();
  vi.stubGlobal("localStorage", disk);
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetLog();
  resetBoot();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("appending", () => {
  it("stamps an id, the time and the session, and sanitises before anything is stored (L-1)", () => {
    log(input({ message: `go ${RQ_KEY}`, data: { attempt: 1, apiKey: "x" } }));
    const [e] = getLog().entries;
    expect(e).toMatchObject({ v: 1, level: "info", feature: "svg", action: "run.start", at: AT, data: { attempt: 1 } });
    expect(e.id).toBe(`${e.sid}-1`);
    expect(JSON.stringify(getLog().entries)).not.toContain(RQ_KEY);
  });

  it("numbers entries in order within a session, never reusing an id", () => {
    logMany(3);
    const ids = getLog().entries.map((e) => e.id);
    const sid = getLog().entries[0].sid;
    expect(ids).toEqual([`${sid}-1`, `${sid}-2`, `${sid}-3`]);
  });

  it("notifies subscribers once per append and keeps one snapshot while nothing changes", () => {
    const seen = vi.fn();
    const off = subscribeLog(seen);
    const before = getLog();
    expect(getLog()).toBe(before);
    log(input());
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getLog()).not.toBe(before);
    off();
    log(input({ message: "later" }));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("folds an identical repeat within two seconds into one entry with a count", () => {
    log(input({ message: "same" }));
    log(input({ message: "same" }));
    log(input({ message: "same" }));
    expect(getLog().entries).toHaveLength(1);
    expect(getLog().entries[0].repeat).toBe(3);
  });

  it("does not fold entries that carry the same words but name different things", () => {
    log(input({ message: "Position 0 failed", action: "item.failed", ids: { run: "r1", source: "pair_a" } }));
    log(input({ message: "Position 0 failed", action: "item.failed", ids: { run: "r1", source: "pair_b" } }));
    log(input({ message: "Position 0 failed", action: "item.failed", ids: { run: "r1", source: "pair_b" } }));
    expect(getLog().entries.map((e) => [e.ids.source, e.repeat ?? 1])).toEqual([["pair_a", 1], ["pair_b", 2]]);
  });

  it("folds entries of one gesture under their fold key and shows the latest", () => {
    for (const pct of [10, 20, 30]) log(input({ message: `padding ${pct}%`, fold: "gesture:sheets-padding" }));
    expect(messages()).toEqual(["padding 30%"]);
  });

  it("drops a flood and says so once, with the count", () => {
    for (let i = 0; i < FLOOD_MAX + 50; i++) log(input({ message: `m${i}` }));
    const entries = getLog().entries;
    expect(entries).toHaveLength(FLOOD_MAX + 1);
    expect(entries[entries.length - 1]).toMatchObject({ feature: "log", action: "flood", level: "warn", data: { suppressed: 50 } });
  });

  it("mirrors a status message 1:1, with the level from err (L-4)", () => {
    logStatus("sheets", "3 icons downloaded", false);
    advance();
    logStatus("batch", "Preset not found", true);
    expect(getLog().entries.map((e) => [e.feature, e.action, e.level, e.message])).toEqual([
      ["sheets", "status", "info", "3 icons downloaded"],
      ["batch", "status", "error", "Preset not found"],
    ]);
  });

  it("offers a per-feature logger for the three levels", () => {
    const svg = logger("svg");
    svg.info("run.start", "starting", { ids: { run: "r1" } });
    advance();
    svg.warn("run.cancel", "stopped", { data: { saved: 2 } });
    advance();
    svg.error("run.done", "failed");
    expect(getLog().entries.map((e) => [e.level, e.action])).toEqual([["info", "run.start"], ["warn", "run.cancel"], ["error", "run.done"]]);
    expect(getLog().entries[0].ids).toEqual({ run: "r1" });
  });

  it("makes ids that carry their prefix and never repeat", () => {
    const ids = Array.from({ length: 200 }, () => newId("r"));
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^r[a-z0-9]+-\d+$/);
  });
});

describe("retention", () => {
  it.each([...MAX_CHOICES])("keeps the newest %i entries and drops the oldest", (max) => {
    setMax(max);
    logMany(max + 7);
    const kept = getLog().entries;
    expect(kept).toHaveLength(max);
    expect(kept[kept.length - 1].message).toBe(`message ${max + 7}`);
  });

  it("applies a lowered maximum to what is stored AND what is shown, at once, and says what it dropped", () => {
    logMany(150);
    setMax(100);
    const entries = getLog().entries;
    expect(entries).toHaveLength(100);
    expect(entries[entries.length - 1]).toMatchObject({ feature: "log", action: "max", level: "warn", data: { from: 1000, to: 100 } });
    expect(Number(entries[entries.length - 1].data.dropped)).toBeGreaterThan(0);
    flushLog();
    expect(stored().entries).toHaveLength(100);
    expect(JSON.parse(disk.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ max: 100 });
  });

  it("ignores a maximum that is not one of the choices", () => {
    logMany(3);
    for (const bad of [0, 99, 1234, -1, Number.NaN]) setMax(bad);
    expect(getLog().prefs.max).toBe(1000);
    expect(getLog().entries).toHaveLength(3);
  });

  it("persists at most the newest entries that fit 256 KB, never more than the maximum", () => {
    logMany(1000, (i) => `${i} ${"lorem ipsum ".repeat(16)}`);
    flushLog();
    const raw = disk.getItem(LOG_KEY) ?? "";
    const kept = stored().entries;
    expect(raw.length).toBeLessThanOrEqual(BYTE_BUDGET);
    expect(kept.length).toBeGreaterThan(100);
    expect(kept.length).toBeLessThan(1000);
    expect(kept.map((e) => e.id)).toEqual(getLog().entries.slice(-kept.length).map((e) => e.id));
  });

  it("minimising is a preference that is stored and restored", () => {
    setMinimized(true);
    expect(getLog().prefs.minimized).toBe(true);
    resetLog();
    resetBoot();
    bootLog();
    expect(getLog().prefs.minimized).toBe(true);
  });
});

describe("writing to storage", () => {
  it("writes once, 500 ms after the last of several appends", () => {
    log(input({ message: "a" }));
    vi.advanceTimersByTime(100);
    log(input({ message: "b" }));
    vi.advanceTimersByTime(100);
    log(input({ message: "c" }));
    vi.advanceTimersByTime(499);
    expect(disk.writesOf(LOG_KEY)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(disk.writesOf(LOG_KEY)).toBe(1);
    expect(stored().entries.map((e) => e.message)).toEqual(["a", "b", "c"]);
  });

  it("still writes while appends keep arriving — a busy log is not starved", () => {
    for (let i = 0; i < 80; i++) {
      log(input({ message: `busy ${i}` }));
      vi.advanceTimersByTime(100);
    }
    expect(disk.writesOf(LOG_KEY)).toBeGreaterThanOrEqual(1);
  });

  it("writes an error at once, without waiting", () => {
    log(input({ level: "error", message: "boom" }));
    expect(disk.writesOf(LOG_KEY)).toBe(1);
    expect(stored().entries[0].message).toBe("boom");
  });

  it("flushes when the page is hidden or closed", () => {
    bootLog();
    log(input({ message: "before hiding" }));
    expect(stored().entries.some((e) => e.message === "before hiding")).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    expect(stored().entries.some((e) => e.message === "before hiding")).toBe(true);
    log(input({ message: "while hidden" }));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(stored().entries.some((e) => e.message === "while hidden")).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});

describe("when storage fails", () => {
  it("keeps the log in memory, says the browser is not saving it, and says so once", () => {
    disk.failSet = true;
    log(input({ level: "error", message: "first" }));
    log(input({ level: "error", message: "second" }));
    expect(getLog().persist).toBe("unavailable");
    expect(messages()).toEqual(expect.arrayContaining(["first", "second"]));
    const failed = getLog().entries.filter((e) => e.action === "storage.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ feature: "app", level: "warn" });
  });

  it("recovers: the next write succeeds with half the byte budget", () => {
    logMany(1000, (i) => `${i} ${"lorem ipsum ".repeat(12)}`);
    disk.failSet = true;
    flushLog();
    expect(getLog().persist).toBe("unavailable");
    disk.failSet = false;
    flushLog();
    expect(getLog().persist).toBe("ok");
    const raw = disk.getItem(LOG_KEY) ?? "";
    expect(raw.length).toBeLessThanOrEqual(BYTE_BUDGET / 2);
    expect(stored().entries.length).toBeGreaterThan(50);
  });

  it("works when storage cannot even be read", () => {
    disk.failGet = true;
    expect(() => bootLog()).not.toThrow();
    log(input({ message: "still here" }));
    expect(messages()).toContain("still here");
    expect(getLog().restore).toBe("none");
  });
});

describe("after a restart (L-9)", () => {
  it("restores the newest entries within the limits, in a new session", () => {
    bootLog();
    logMany(5);
    flushLog();
    const oldSid = getLog().entries[0].sid;
    resetLog();
    resetBoot();
    bootLog();
    const restored = getLog().entries;
    expect(restored.slice(0, 5 + 1).map((e) => e.message)).toEqual(expect.arrayContaining(["message 1", "message 5"]));
    expect(restored[restored.length - 1]).toMatchObject({ feature: "app", action: "boot", data: { restored: 6 } });
    expect(restored[restored.length - 1].sid).not.toBe(oldSid);
    expect(getLog().restore).toBe("none");
  });

  it("trims what it restores to the stored maximum, keeping the newest", () => {
    disk.setItem(LOG_KEY, serializeLog(entries(300), BYTE_BUDGET, AT));
    disk.setItem(PREFS_KEY, serializeLogPrefs({ max: 100, minimized: false }));
    bootLog();
    const kept = getLog().entries;
    expect(kept).toHaveLength(100);
    expect(getLog().prefs.max).toBe(100);
    expect(kept[kept.length - 1]).toMatchObject({ action: "boot" });
    expect(kept[kept.length - 2].message).toBe("message 300");
    expect(kept[0].message).toBe("message 202");
  });

  it("trims at hydration itself, before the first new entry could do it", () => {
    hydrate({ entries: entries(300), status: "ok" }, { max: 100, minimized: false });
    expect(getLog().entries).toHaveLength(100);
    expect(getLog().entries[0].message).toBe("message 201");
  });

  it("starts empty with ONE warning when the stored log is corrupt — different from a first run", () => {
    disk.setItem(LOG_KEY, "{oops");
    bootLog();
    const kinds = getLog().entries.map((e) => `${e.feature}.${e.action}`);
    expect(kinds).toEqual(["log.restore.failed", "app.boot"]);
    expect(getLog().entries[0].level).toBe("warn");
    expect(getLog().restore).toBe("corrupt");
  });

  it("is silent on a first run", () => {
    bootLog();
    expect(getLog().entries.map((e) => `${e.feature}.${e.action}`)).toEqual(["app.boot"]);
    expect(getLog().restore).toBe("none");
  });

  it("is idempotent: booting twice records one boot", () => {
    bootLog();
    bootLog();
    expect(getLog().entries.filter((e) => e.action === "boot")).toHaveLength(1);
  });

  it("keeps what was logged before boot, after what was restored", () => {
    logMany(2);
    flushLog();
    resetLog();
    resetBoot();
    log(input({ message: "before boot" }));
    bootLog();
    expect(messages()).toEqual(expect.arrayContaining(["message 1", "message 2", "before boot"]));
    expect(messages().indexOf("message 2")).toBeLessThan(messages().indexOf("before boot"));
  });
});

describe("never failing a feature (L-2)", () => {
  it("survives a subscriber that throws, and counts it", () => {
    const off = subscribeLog(() => { throw new Error("broken subscriber"); });
    try {
      expect(() => log(input({ message: "one" }))).not.toThrow();
      expect(() => log(input({ message: "two" }))).not.toThrow();
      expect(getLog().dropped).toBeGreaterThanOrEqual(1);
      expect(messages()).toEqual(["one", "two"]);
    } finally {
      off();
    }
  });

  it("counts an entry it could not record instead of failing the feature or staying silent", () => {
    vi.spyOn(Date, "now").mockImplementationOnce(() => { throw new Error("clock broken"); });
    expect(() => log(input({ message: "lost" }))).not.toThrow();
    expect(getLog().dropped).toBe(1);
    expect(messages()).toEqual([]);
    log(input({ message: "recorded afterwards" }));
    expect(messages()).toEqual(["recorded afterwards"]);
    expect(getLog().dropped).toBe(1);
  });

  it("keeps notifying the healthy subscribers when one of them is broken", () => {
    const healthy = vi.fn();
    const offBroken = subscribeLog(() => { throw new Error("broken subscriber"); });
    const offHealthy = subscribeLog(healthy);
    try {
      log(input({ message: "one" }));
      expect(healthy).toHaveBeenCalledTimes(1);
    } finally {
      offBroken();
      offHealthy();
    }
  });

  it("survives hostile input", () => {
    expect(() => log(null as never)).not.toThrow();
    expect(() => log({ level: 1, feature: {}, action: [], message: Symbol("x") } as never)).not.toThrow();
  });
});

describe("clearing and copying", () => {
  it("empties memory and storage and leaves exactly one breadcrumb that says how many went", () => {
    logMany(7);
    flushLog();
    clearLog();
    const [crumb, ...rest] = getLog().entries;
    expect(rest).toHaveLength(0);
    expect(crumb).toMatchObject({ feature: "log", action: "clear", level: "info", data: { removed: 7 } });
    expect(stored().entries).toHaveLength(1);
    expect(stored().entries[0].action).toBe("clear");
  });

  it("copies exactly formatAll of what is stored, with the secrets known now", () => {
    logMany(3);
    expect(copyAllText()).toBe(formatAll(getLog().entries, new Date().toISOString(), []));
    expect(copyAllText().split("\n")[0]).toContain("3 entries");
  });
});

describe("secrets", () => {
  it("masks a registered key from then on, and stops when it is forgotten", () => {
    watchSecret(PLAIN_SECRET);
    log(input({ message: `a ${PLAIN_SECRET}` }));
    advance();
    forgetSecret(PLAIN_SECRET);
    log(input({ message: `b ${PLAIN_SECRET}` }));
    const [a, b] = getLog().entries;
    expect(a.message).not.toContain(PLAIN_SECRET);
    expect(b.message).toContain(PLAIN_SECRET);
  });

  it("masks in the Copy text a key that was registered after the entry was stored", () => {
    log(input({ message: `early ${PLAIN_SECRET}` }));
    expect(copyAllText()).toContain(PLAIN_SECRET);
    watchSecret(PLAIN_SECRET);
    expect(copyAllText()).not.toContain(PLAIN_SECRET);
  });

  it("ignores an empty or blank registration", () => {
    watchSecret("");
    watchSecret("   ");
    log(input({ message: "nothing to hide" }));
    expect(messages()).toEqual(["nothing to hide"]);
  });
});

describe("test isolation helper", () => {
  it("resetLog empties memory but never touches storage", () => {
    entry();
    logMany(2);
    flushLog();
    resetLog();
    expect(getLog().entries).toHaveLength(0);
    expect(stored().entries).toHaveLength(2);
  });
});
