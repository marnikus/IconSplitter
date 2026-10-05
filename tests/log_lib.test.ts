// log_lib.test.ts — the pure rules of the global log (feature §2/§3): one entry
// shape, a bounded ring buffer, redaction that a stored payload cannot escape,
// and validate-on-read that turns corruption into defaults instead of a crash.
import { describe, expect, it } from "vitest";
import {
  appendEntry, clampLogMax, createEntry, emptyLogPayload, formatEntry, formatLogText,
  parseLogPayload, sanitizeData, sanitizeText, serializeLog,
  DEFAULT_LOG_MAX, LOG_MAX_CHOICES, LOG_VERSION, type LogEntry,
} from "../src/lib/log";

/** Assembled from parts so this test file itself stays free of a key literal. */
const KEY = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const entry = (n: number, patch: Partial<LogEntry> = {}): LogEntry => ({
  ...createEntry({ feature: "svg", action: `action-${n}` }, "2026-10-05T10:00:00.000Z", `l${n}`),
  ...patch,
});

describe("clampLogMax — one bounded cap for display and storage", () => {
  it("offers only the documented sizes", () => {
    expect(LOG_MAX_CHOICES).toEqual([50, 100, 200, 500, 1000]);
    expect(DEFAULT_LOG_MAX).toBe(200);
  });

  it("falls back to the default for nonsense or absence", () => {
    for (const raw of [undefined, null, "abc", Number.NaN, {}]) {
      expect(clampLogMax(raw)).toBe(DEFAULT_LOG_MAX);
    }
  });

  it("clamps into range and snaps to the nearest offered size", () => {
    expect(clampLogMax(0)).toBe(50);
    expect(clampLogMax(12)).toBe(50);
    expect(clampLogMax(250)).toBe(200);
    expect(clampLogMax(600)).toBe(500);
    expect(clampLogMax(99_999)).toBe(1000);
    expect(clampLogMax(199.6)).toBe(200);
  });
});

describe("sanitizeText — nothing dangerous leaves the log", () => {
  it("masks key-shaped text", () => {
    const out = sanitizeText(`401 for ${KEY} while sending`);
    expect(out).not.toContain(KEY);
    expect(out).toContain("•");
  });

  it("replaces data URLs by their marker", () => {
    const out = sanitizeText(`image data:image/png;base64,${"A".repeat(80)} done`);
    expect(out).not.toContain("A".repeat(40));
    expect(out).toContain("[data-url]");
  });

  it("collapses a multi-line detail into one line and truncates", () => {
    expect(sanitizeText("first\nsecond\t third")).toBe("first second third");
    const long = sanitizeText("x".repeat(1_000));
    expect(long.length).toBeLessThanOrEqual(401);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("sanitizeData — scalars only, secrets dropped", () => {
  it("drops sensitive keys but keeps the token counters", () => {
    const out = sanitizeData({ apiKey: KEY, key: KEY, access_token: KEY, authorization: "Bearer x", tokens: 5, total: 8 });
    expect(Object.keys(out).sort()).toEqual(["tokens", "total"]);
    expect(out.tokens).toBe(5);
  });

  it("keeps scalars, drops objects/arrays/undefined and redacts string values", () => {
    const out = sanitizeData({ ok: true, n: 3, s: `used ${KEY}`, obj: { a: 1 }, arr: [1, 2], gone: undefined });
    expect(Object.keys(out).sort()).toEqual(["n", "ok", "s"]);
    expect(String(out.s)).not.toContain(KEY);
  });

  it("caps the number of keys a detail may add", () => {
    const wide = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeData(wide)).length).toBeLessThanOrEqual(12);
  });
});

describe("createEntry / appendEntry", () => {
  it("builds a complete entry with defaults and the shipped schema version", () => {
    const e = createEntry({ feature: "app", action: "open-tab", detail: "tab=svg", data: { tab: "svg" }, ids: { pair: "pair_1" } }, "2026-10-05T10:00:00.000Z", "l1");
    expect(e).toMatchObject({ id: "l1", at: "2026-10-05T10:00:00.000Z", level: "info", feature: "app", action: "open-tab", v: LOG_VERSION });
    expect(e.ids).toEqual({ pair: "pair_1" });
    expect(e.data).toEqual({ tab: "svg" });
  });

  it("drops the oldest entry once the cap is reached, without mutating the input", () => {
    const list = Array.from({ length: 50 }, (_, i) => entry(i));
    const next = appendEntry(list, entry(99), 50);
    expect(list).toHaveLength(50); // input untouched
    expect(next).toHaveLength(50);
    expect(next[0].action).toBe("action-1");
    expect(next[49].action).toBe("action-99");
  });

  it("keeps a short list as-is", () => {
    expect(appendEntry([entry(1)], entry(2), 1_000).map((e) => e.action)).toEqual(["action-1", "action-2"]);
  });
});

describe("formatEntry / formatLogText — one text shape for the row and for Copy all", () => {
  it("names the timestamp, level, feature, action, ids and details", () => {
    const e = createEntry(
      { level: "warn", feature: "svg", action: "request-retry", ids: { batch: "batch_1_4", source: "pair_2" }, detail: "attempt 1 of 3", data: { delayMs: 500 } },
      "2026-10-05T10:00:00.000Z", "l1",
    );
    expect(formatEntry(e)).toBe(
      "2026-10-05T10:00:00.000Z WARN  svg.request-retry · batch=batch_1_4 · source=pair_2 · attempt 1 of 3 · delayMs=500",
    );
  });

  it("joins entries chronologically and prints nothing for an empty log", () => {
    expect(formatLogText([])).toBe("");
    expect(formatLogText([entry(1), entry(2)])).toBe(`${formatEntry(entry(1))}\n${formatEntry(entry(2))}`);
  });
});

describe("parseLogPayload — corrupt storage costs one ignored load", () => {
  it("round-trips a real payload", () => {
    const payload = { max: 100, minimized: true, entries: [entry(1), entry(2)] };
    expect(parseLogPayload(serializeLog(payload))).toEqual(payload);
  });

  it("falls back to defaults for corrupt JSON, a foreign version or a wrong shape", () => {
    const empty = emptyLogPayload();
    expect(parseLogPayload("{not json")).toEqual(empty);
    expect(parseLogPayload(JSON.stringify({ v: LOG_VERSION + 1, max: 100, minimized: true, entries: [entry(1)] }))).toEqual(empty);
    expect(parseLogPayload(JSON.stringify({ v: LOG_VERSION, max: 100, entries: "nope" }))).toEqual({
      max: 100, minimized: false, entries: [],
    });
  });

  it("keeps the valid entries of a partly damaged payload and caps them to the stored maximum", () => {
    const good = entry(1);
    const broken = { nope: true };
    const raw = JSON.stringify({
      v: LOG_VERSION, max: 50, minimized: false,
      entries: [broken, good, { id: "l9", at: "not-a-date", level: "info", feature: "x", action: "y", v: LOG_VERSION }],
    });
    const out = parseLogPayload(raw);
    expect(out.entries.map((e) => e.id)).toEqual([good.id]);
    const many = { v: LOG_VERSION, max: 50, minimized: false, entries: Array.from({ length: 60 }, (_, i) => entry(i)) };
    expect(parseLogPayload(JSON.stringify(many)).entries).toHaveLength(50);
    expect(parseLogPayload(JSON.stringify(many)).entries[49].id).toBe("l59");
  });

  it("re-sanitises what it reads, so an old payload cannot introduce a secret", () => {
    const raw = JSON.stringify({
      v: LOG_VERSION, max: 200, minimized: false,
      entries: [{
        ...entry(1), detail: `sent ${KEY}`, data: { apiKey: KEY, note: `data:image/png;base64,${"B".repeat(80)}` },
        ids: { apiKey: KEY },
      }],
    });
    const out = parseLogPayload(raw);
    const text = formatLogText(out.entries);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("B".repeat(40));
  });
});
