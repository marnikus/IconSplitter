// log_format.test.ts — one set of helpers draws a row AND writes the Copy-all
// text, so what is shown is what is copied (L-6). Pure (RULE 5/8).
import { describe, expect, it } from "vitest";
import { detailText, entryParts, formatAll, formatEntry, timeOf } from "../src/lib/logformat";
import { AT, PLAIN_SECRET, RQ_KEY, entries, entry } from "./helpers/logfix";

const usage = (over: Partial<NonNullable<ReturnType<typeof entry>["usage"]>> = {}) =>
  ({ input: 4100, output: 2200, total: 6300, cost: 0.021, estimated: null, currency: "USD", ...over });

describe("detailText", () => {
  it("lists ids, then data in order, then usage — muted details, never the message", () => {
    const e = entry({ ids: { run: "r1xk-1", batch: "batch_1_4" }, data: { attempt: 1, of: 3, fp: "3fa9c1d2.1b4" }, usage: usage() });
    expect(detailText(e)).toBe("run r1xk-1 · batch batch_1_4 · attempt 1 · of 3 · fp 3fa9c1d2.1b4 · 4,100 in · 2,200 out · $0.0210 reported");
  });

  it("is empty for an entry with no ids, data or usage", () => {
    expect(detailText(entry())).toBe("");
  });

  it("keeps reported and estimated money apart and says which is which (L-5)", () => {
    expect(detailText(entry({ usage: usage({ cost: 0.02, estimated: null }) }))).toContain("$0.0200 reported");
    expect(detailText(entry({ usage: usage({ cost: null, estimated: 0.03 }) }))).toContain("$0.0300 Estimated");
    expect(detailText(entry({ usage: usage({ cost: 0.02, estimated: 0.03 }) }))).toMatch(/\$0\.0200 reported · \$0\.0300 Estimated/);
    expect(detailText(entry({ usage: usage({ cost: null, estimated: null }) }))).toContain("no cost reported");
    expect(detailText(entry({ usage: usage({ cost: 0.02 }) }))).not.toContain("Estimated");
  });

  it("shows a null data value as a dash and a boolean as words", () => {
    expect(detailText(entry({ data: { status: null, ok: true } }))).toBe("status — · ok true");
  });
});

describe("formatEntry", () => {
  it("is one line: ISO time, glyph + word, feature, action, message, details, repeat", () => {
    const e = entry({ level: "warn", feature: "svg", action: "request.retry", message: "rate limited", data: { attempt: 1 }, repeat: 3 });
    expect(formatEntry(e)).toBe(`${AT} ▲ WARN svg request.retry rate limited · attempt 1 ×3`);
  });

  it("writes the level as a word first and a glyph second, for all three levels", () => {
    expect(formatEntry(entry({ level: "info" }))).toContain("ⓘ INFO");
    expect(formatEntry(entry({ level: "warn" }))).toContain("▲ WARN");
    expect(formatEntry(entry({ level: "error" }))).toContain("✖ ERROR");
  });

  it("omits the repeat mark for a single occurrence", () => {
    expect(formatEntry(entry({ repeat: 1 }))).not.toContain("×");
    expect(formatEntry(entry())).not.toContain("×");
  });

  it("flattens a newline that reached it anyway", () => {
    expect(formatEntry(entry({ message: "one\ntwo" })).includes("\n")).toBe(false);
  });
});

describe("entryParts — what a row draws", () => {
  it("carries the same words the copied line carries", () => {
    const e = entry({ level: "error", action: "request.failed", message: "boom", data: { status: 500 }, repeat: 2 });
    const p = entryParts(e);
    expect(p).toMatchObject({ glyph: "✖", word: "ERROR", feature: "svg", action: "request.failed", message: "boom", detail: "status 500", repeat: 2, iso: AT });
    expect(formatEntry(e)).toBe(`${p.iso} ${p.glyph} ${p.word} ${p.feature} ${p.action} ${p.message} · ${p.detail} ×${p.repeat}`);
  });
});

describe("timeOf", () => {
  it("formats local HH:mm:ss.SSS", () => {
    const d = new Date(AT);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    expect(timeOf(AT)).toBe(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`);
  });

  it("shows placeholders for a timestamp that is not a date", () => {
    expect(timeOf("not a date")).toBe("--:--:--.---");
  });
});

describe("formatAll", () => {
  it("opens with a header that counts the entries and names the export time", () => {
    const text = formatAll(entries(3), "2026-10-05T12:00:00.000Z", []);
    expect(text.split("\n")[0]).toBe("Icon Splitter log · 3 entries · exported 2026-10-05T12:00:00.000Z");
    expect(text.split("\n")).toHaveLength(1 + 1 + 3); // header, one session line, three entries
  });

  it("says so for an empty log", () => {
    expect(formatAll([], "2026-10-05T12:00:00.000Z", []).split("\n")[0]).toContain("0 entries");
  });

  it("draws a break where the session changes", () => {
    const list = [...entries(2), ...entries(2, (i) => ({ id: `s2-${i}`, sid: "s2" }))];
    const lines = formatAll(list, AT, []).split("\n");
    expect(lines.filter((l) => l.startsWith("— session"))).toHaveLength(2);
    expect(lines[1]).toContain("session s1");
    expect(lines[4]).toContain("session s2");
  });

  it("masks a secret that was registered after the entry was stored", () => {
    const list = [entry({ message: `late ${PLAIN_SECRET}` })];
    expect(formatAll(list, AT, [PLAIN_SECRET])).not.toContain(PLAIN_SECRET);
    expect(formatAll(list, AT, [])).toContain(PLAIN_SECRET);
  });

  it("masks a key-shaped value that slipped into storage some other way", () => {
    expect(formatAll([entry({ message: `x ${RQ_KEY}` })], AT, [])).not.toContain(RQ_KEY);
  });
});
