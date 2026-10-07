// upload_journal.test.ts — the in-flight metadata-request journal (design
// §3.2, I-20): an open entry after a restart is an interrupted request, never
// an automatic resend. The memory journal serves tests; the stored journal
// survives a restart, and a corrupt payload costs one ignored load.
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryJournal, createStoredJournal, JOURNAL_KEY, type StorageLike } from "../src/upload/journal";

/** A minimal localStorage stand-in (the stored journal takes any StorageLike). */
function memStorage(): StorageLike & { dump: () => string } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    dump: () => map.get(JOURNAL_KEY) ?? "",
  };
}

beforeEach(() => localStorage.clear());

describe("the memory journal", () => {
  it("tracks open entries and forgets them when they end", () => {
    const j = createMemoryJournal();
    j.begin({ rowId: "a", startedAt: 1, requestId: null });
    j.begin({ rowId: "b", startedAt: 2, requestId: "r" });
    expect(j.pending().map((e) => e.rowId).sort()).toEqual(["a", "b"]);
    j.end("a");
    expect(j.pending().map((e) => e.rowId)).toEqual(["b"]);
    j.clear();
    expect(j.pending()).toEqual([]);
  });

  it("replaces an entry for the same row instead of duplicating it", () => {
    const j = createMemoryJournal();
    j.begin({ rowId: "a", startedAt: 1, requestId: null });
    j.begin({ rowId: "a", startedAt: 9, requestId: "r" });
    expect(j.pending()).toEqual([{ rowId: "a", startedAt: 9, requestId: "r" }]);
  });
});

describe("the stored journal", () => {
  it("persists open entries across a restart (a new instance, same storage)", () => {
    const first = createStoredJournal(memStorage());
    first.begin({ rowId: "a", startedAt: 5, requestId: null });
    const afterRestart = createStoredJournal(memStorage());
    // the SAME storage object would need sharing; use localStorage instead:
    void afterRestart;
    const shared = memStorage();
    createStoredJournal(shared).begin({ rowId: "b", startedAt: 6, requestId: null });
    expect(createStoredJournal(shared).pending()).toEqual([{ rowId: "b", startedAt: 6, requestId: null }]);
  });

  it("ends and clears entries in storage", () => {
    const storage = memStorage();
    const j = createStoredJournal(storage);
    j.begin({ rowId: "a", startedAt: 1, requestId: null });
    j.begin({ rowId: "b", startedAt: 2, requestId: null });
    j.end("a");
    expect(j.pending().map((e) => e.rowId)).toEqual(["b"]);
    j.clear();
    expect(storage.dump()).toBe("");
  });

  it("reads the default localStorage journal and ignores a corrupt payload", () => {
    const j = createStoredJournal();
    j.begin({ rowId: "a", startedAt: 1, requestId: null });
    expect(j.pending().map((e) => e.rowId)).toEqual(["a"]);
    localStorage.setItem(JOURNAL_KEY, "{oops");
    expect(createStoredJournal().pending()).toEqual([]);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify([{ nope: 1 }, "x", { rowId: "ok", startedAt: 3 }]));
    expect(createStoredJournal().pending()).toEqual([{ rowId: "ok", startedAt: 3 }]);
  });

  it("keeps working when storage refuses the write", () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("quota"); },
    };
    const j = createStoredJournal(broken);
    expect(() => j.begin({ rowId: "a", startedAt: 1, requestId: null })).not.toThrow();
    expect(j.pending()).toEqual([]); // nothing could be written — honestly empty
  });
});
