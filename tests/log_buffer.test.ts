// log_buffer.test.ts — the ring, the fold and the flood guard (log-contract.md
// §6). Pure: every case builds entries and calls admit/trimTo (RULE 5/8).
import { describe, expect, it } from "vitest";
import { FLOOD_MAX, FLOOD_MS, FOLD_MS, admit, emptyBuffer, trimTo, type LogBuffer } from "../src/lib/logbuffer";
import { entries, entry } from "./helpers/logfix";

const T0 = 1_000_000;

/** Admits each entry at `now`, folding on feature|action|level|message unless told otherwise. */
function admitAll(list: ReturnType<typeof entries>, opts: { max?: number; at?: (i: number) => number; fold?: (i: number) => string } = {}): LogBuffer {
  const { max = 1000, at = () => T0, fold } = opts;
  return list.reduce((buf, e, i) => admit(buf, e, { now: at(i), max, fold: fold ? fold(i) : `${e.feature}|${e.action}|${e.level}|${e.message}` }), emptyBuffer());
}

describe("the ring", () => {
  it("keeps the newest N and drops the oldest on append", () => {
    const buf = admitAll(entries(5), { max: 3 });
    expect(buf.entries.map((e) => e.id)).toEqual(["s1-3", "s1-4", "s1-5"]);
  });

  it("trims at once when the maximum is lowered", () => {
    const buf = admitAll(entries(10));
    expect(trimTo(buf, 4).entries.map((e) => e.id)).toEqual(["s1-7", "s1-8", "s1-9", "s1-10"]);
    expect(trimTo(buf, 50)).toBe(buf);
  });

  it("keeps the order of admission", () => {
    const buf = admitAll(entries(40));
    expect(buf.entries.map((e) => e.id)).toEqual(entries(40).map((e) => e.id));
  });

  it("never mutates what it is given", () => {
    const list = entries(3);
    list.forEach((e) => Object.freeze(e));
    const first = admitAll(list);
    Object.freeze(first.entries);
    expect(() => admit(first, entry({ id: "s1-9", message: "message 1" }), { now: T0, max: 3, fold: "x" })).not.toThrow();
    expect(() => trimTo(first, 1)).not.toThrow();
  });
});

describe("fold", () => {
  const same = (n: number) => entry({ id: `s1-${n}`, message: "same message", at: `2026-10-05T10:00:0${n}.000Z` });

  it("folds a repeat of the previous entry within two seconds into repeat + 1 and refreshes the entry", () => {
    const buf = [1, 2, 3].reduce((b, n) => admit(b, same(n), { now: T0 + n * 100, max: 100, fold: "k" }), emptyBuffer());
    expect(buf.entries).toHaveLength(1);
    expect(buf.entries[0]).toMatchObject({ id: "s1-1", repeat: 3, at: same(3).at });
  });

  it("refreshes the message of the folded entry to the latest occurrence", () => {
    let buf = admit(emptyBuffer(), entry({ id: "s1-1", message: "level 10%" }), { now: T0, max: 9, fold: "slider" });
    buf = admit(buf, entry({ id: "s1-2", message: "level 20%", data: { count: 2 } }), { now: T0 + 50, max: 9, fold: "slider" });
    expect(buf.entries).toHaveLength(1);
    expect(buf.entries[0]).toMatchObject({ id: "s1-1", message: "level 20%", repeat: 2, data: { count: 2 } });
  });

  it("does not fold beyond the window, and the window slides while repeats keep coming", () => {
    const gap = (ms: number) => admit(admit(emptyBuffer(), same(1), { now: T0, max: 9, fold: "k" }), same(2), { now: T0 + ms, max: 9, fold: "k" });
    expect(gap(FOLD_MS).entries).toHaveLength(1);
    expect(gap(FOLD_MS + 1).entries).toHaveLength(2);
    let buf = emptyBuffer();
    for (let n = 0; n < 5; n++) buf = admit(buf, same(1), { now: T0 + n * 1500, max: 9, fold: "k" });
    expect(buf.entries).toHaveLength(1);
    expect(buf.entries[0].repeat).toBe(5);
  });

  it("folds only with the previous entry, never across a different one", () => {
    const a = (n: number) => entry({ id: `s1-${n}`, message: "A" });
    const b = entry({ id: "s1-9", message: "B" });
    let buf = admit(emptyBuffer(), a(1), { now: T0, max: 9, fold: "A" });
    buf = admit(buf, b, { now: T0 + 10, max: 9, fold: "B" });
    buf = admit(buf, a(2), { now: T0 + 20, max: 9, fold: "A" });
    expect(buf.entries.map((e) => e.message)).toEqual(["A", "B", "A"]);
  });

  it("folds entries with different messages when they share a gesture key", () => {
    const buf = admitAll(entries(4), { fold: () => "gesture:sheets-padding" });
    expect(buf.entries).toHaveLength(1);
    expect(buf.entries[0]).toMatchObject({ message: "message 4", repeat: 4 });
  });

  it("never lets a fold grow the ring", () => {
    const buf = admitAll(entries(8), { max: 3, fold: () => "k" });
    expect(buf.entries).toHaveLength(1);
  });
});

describe("flood guard", () => {
  const flooded = (n: number, fold?: (i: number) => string) => admitAll(entries(n), { at: () => T0, fold });

  it("admits 100 entries in a second, drops the rest and records ONE log.flood with the count", () => {
    const buf = flooded(FLOOD_MAX + 50);
    expect(buf.entries).toHaveLength(FLOOD_MAX + 1);
    const note = buf.entries[buf.entries.length - 1];
    expect(note).toMatchObject({ level: "warn", feature: "log", action: "flood", data: { suppressed: 50 } });
    expect(buf.entries.filter((e) => e.action === "flood")).toHaveLength(1);
  });

  it("counts folded repeats too, so an effect loop logging one message is caught", () => {
    const buf = flooded(FLOOD_MAX + 30, () => "same");
    expect(buf.entries).toHaveLength(2);
    expect(buf.entries[0].repeat).toBe(FLOOD_MAX);
    expect(buf.entries[1]).toMatchObject({ action: "flood", data: { suppressed: 30 } });
  });

  it("rolls the window: after a second entries are admitted again and the old note keeps its count", () => {
    let buf = flooded(FLOOD_MAX + 5);
    const more = entries(3, (i) => ({ id: `s2-${i}`, message: `later ${i}` }));
    buf = more.reduce((b, e) => admit(b, e, { now: T0 + FLOOD_MS, max: 1000, fold: e.message }), buf);
    expect(buf.entries.slice(-3).map((e) => e.message)).toEqual(["later 1", "later 2", "later 3"]);
    expect(buf.entries.find((e) => e.action === "flood")?.data).toEqual({ suppressed: 5 });
    expect(buf.entries.filter((e) => e.action === "flood")).toHaveLength(1);
  });

  it("starts a fresh note for a second flood", () => {
    let buf = flooded(FLOOD_MAX + 2);
    const burst = entries(FLOOD_MAX + 2, (i) => ({ id: `s3-${i}`, message: `burst ${i}` }));
    buf = burst.reduce((b, e) => admit(b, e, { now: T0 + 5000, max: 1000, fold: e.message }), buf);
    expect(buf.entries.filter((e) => e.action === "flood").map((e) => e.data.suppressed)).toEqual([2, 2]);
  });

  it("stays under the limit when the clock stands still or goes backwards", () => {
    const buf = admitAll(entries(120), { at: (i) => T0 - i });
    expect(buf.entries.length).toBeLessThanOrEqual(FLOOD_MAX + 1);
  });
});
