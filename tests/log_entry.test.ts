// log_entry.test.ts — the entry schema and its storage form (log-contract.md §3,
// §7). Pure functions, so every case is a plain call (RULE 5/8): a payload that
// is damaged, tampered or from another version costs one ignored load (RULE 13),
// never a broken log, and never a secret re-entering through storage.
import { describe, expect, it } from "vitest";
import { LOG_DATA_KEYS, isEntry, parseLog, serializeLog } from "../src/lib/logentry";
import { DEFAULT_LOG_PREFS, MAX_CHOICES, parseLogPrefs, serializeLogPrefs } from "../src/lib/logprefs";
import { AT, RQ_KEY, entries, entry } from "./helpers/logfix";

const payload = (list: unknown[], over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, savedAt: AT, entries: list, ...over });

describe("parseLog / serializeLog", () => {
  it("round-trips entries unchanged", () => {
    const list = [entry({ usage: { input: 1, output: 2, total: 3, cost: 0.01, estimated: null, currency: "USD" } }), ...entries(3)];
    const out = parseLog(serializeLog(list, 1_000_000, AT));
    expect(out.status).toBe("ok");
    expect(out.entries).toEqual(list);
  });

  it("tells a first run from a damaged payload", () => {
    expect(parseLog(null)).toEqual({ entries: [], status: "empty" });
    expect(parseLog("")).toEqual({ entries: [], status: "empty" });
    expect(parseLog("{not json")).toEqual({ entries: [], status: "corrupt" });
  });

  it("rejects a payload that is not ours: wrong version, wrong shape", () => {
    for (const text of [payload([entry()], { v: 2 }), "[]", "null", "\"x\"", JSON.stringify({ v: 1, entries: "nope" })]) {
      expect(parseLog(text).status, text).toBe("corrupt");
    }
  });

  it("keeps the valid entries and drops the damaged ones", () => {
    const good = entries(2);
    const damaged = [{ ...entry(), id: 7 }, { ...entry(), level: "fatal" }, "text", null, { v: 1 }];
    const out = parseLog(payload([good[0], ...damaged, good[1]]));
    expect(out.status).toBe("ok");
    expect(out.entries).toEqual(good);
  });

  it("calls a payload corrupt when nothing in it can be used", () => {
    expect(parseLog(payload([{ nope: true }, 3])).status).toBe("corrupt");
    expect(parseLog(payload([])).status).toBe("ok");
  });

  it("drops __proto__ and keys outside the allow-list from a tampered entry, without polluting anything", () => {
    const text = payload([entry()]).replace("\"data\":{}", "\"data\":{\"__proto__\":{\"polluted\":1},\"apiKey\":\"zzz\",\"attempt\":1}");
    const out = parseLog(text);
    expect(out.entries[0].data).toEqual({ attempt: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("re-sanitises on read, so a stored secret cannot come back", () => {
    const out = parseLog(payload([entry({ message: `leaked ${RQ_KEY} here` })]));
    expect(out.entries[0].message).not.toContain(RQ_KEY);
    expect(JSON.stringify(out.entries)).not.toContain(RQ_KEY);
  });

  it("cuts an over-long entry instead of dropping it", () => {
    const fat: Record<string, string> = {};
    for (const key of [...LOG_DATA_KEYS].slice(0, 24)) fat[key] = "lorem ipsum ".repeat(40);
    const out = parseLog(payload([entry({ message: "lorem ipsum dolor ".repeat(500), data: fat })]));
    expect(out.entries).toHaveLength(1);
    expect(JSON.stringify(out.entries[0]).length).toBeLessThanOrEqual(2048);
    expect(out.entries[0].message).toMatch(/…\(\+\d+\)$/);
  });

  it("drops the oldest entries until the byte budget fits and keeps the newest in order", () => {
    const list = entries(60);
    const one = JSON.stringify(list[0]).length;
    const text = serializeLog(list, one * 20, AT);
    expect(text.length).toBeLessThanOrEqual(one * 20);
    const kept = parseLog(text).entries;
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.length).toBeLessThan(21);
    expect(kept.map((e) => e.id)).toEqual(list.slice(-kept.length).map((e) => e.id));
  });

  it("serialises an empty list for a budget nothing fits in", () => {
    expect(parseLog(serializeLog(entries(5), 10, AT))).toEqual({ entries: [], status: "ok" });
  });
});

describe("isEntry", () => {
  it("accepts a well-formed entry, with and without usage and repeat", () => {
    expect(isEntry(entry())).toBe(true);
    expect(isEntry(entry({ repeat: 3, usage: { input: null, output: null, total: null, cost: null, estimated: 0.5, currency: "USD" } }))).toBe(true);
  });

  it.each([
    ["unknown level", { level: "fatal" }],
    ["unknown feature", { feature: "billing" }],
    ["action with capitals", { action: "Run.Start" }],
    ["action too deep", { action: "a.b.c.d" }],
    ["action too long", { action: `x${"y".repeat(40)}` }],
    ["numeric id", { id: 7 }],
    ["wrong version", { v: 2 }],
    ["ids holding a number", { ids: { run: 1 } }],
    ["data holding an object", { data: { attempt: { a: 1 } } }],
    ["usage holding a string", { usage: { input: "1", output: null, total: null, cost: null, estimated: null, currency: "USD" } }],
    ["repeat of zero", { repeat: 0 }],
    ["id with a space", { id: "s1 1" }],
    ["id too long", { id: "s".repeat(65) }],
    ["timestamp that is not ISO", { at: "yesterday" }],
  ])("rejects %s", (_name, over) => {
    expect(isEntry({ ...entry(), ...over })).toBe(false);
  });

  it("rejects things that are not objects", () => {
    for (const x of [null, undefined, 3, "x", []]) expect(isEntry(x)).toBe(false);
  });
});

describe("LOG_DATA_KEYS", () => {
  it("holds the keys of the vocabulary and nothing that names a credential", () => {
    for (const key of ["attempt", "fp", "chars", "status", "waitMs", "suppressed", "hash", "model"]) expect(LOG_DATA_KEYS.has(key)).toBe(true);
    for (const key of ["apiKey", "key", "token", "authorization", "password", "prompt", "text", "body", "image"]) expect(LOG_DATA_KEYS.has(key)).toBe(false);
  });
});

describe("log preferences", () => {
  it("starts open at 1 000 entries", () => {
    expect(DEFAULT_LOG_PREFS).toEqual({ max: 1000, minimized: false });
    expect(parseLogPrefs(null)).toEqual(DEFAULT_LOG_PREFS);
  });

  it("round-trips a valid choice", () => {
    const prefs = { max: 250, minimized: true };
    expect(parseLogPrefs(serializeLogPrefs(prefs))).toEqual(prefs);
  });

  it("takes max only from the fixed choices, and falls back for anything else", () => {
    for (const max of MAX_CHOICES) expect(parseLogPrefs(JSON.stringify({ v: 1, max, minimized: false })).max).toBe(max);
    for (const bad of [0, 99, 1234, 1e9, -5, "500", null, 500.5]) {
      expect(parseLogPrefs(JSON.stringify({ v: 1, max: bad, minimized: true })), String(bad)).toEqual({ max: 1000, minimized: true });
    }
  });

  it("falls back for a non-boolean minimized, a wrong version and corrupt JSON", () => {
    expect(parseLogPrefs(JSON.stringify({ v: 1, max: 500, minimized: "yes" }))).toEqual({ max: 500, minimized: false });
    expect(parseLogPrefs(JSON.stringify({ v: 9, max: 500, minimized: true }))).toEqual(DEFAULT_LOG_PREFS);
    expect(parseLogPrefs("{oops")).toEqual(DEFAULT_LOG_PREFS);
  });

  it("offers ascending choices that include the default", () => {
    expect([...MAX_CHOICES]).toEqual([...MAX_CHOICES].sort((a, b) => a - b));
    expect(MAX_CHOICES).toContain(DEFAULT_LOG_PREFS.max);
  });
});
