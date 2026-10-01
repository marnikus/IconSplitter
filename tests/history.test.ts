// history.test.ts — RULE 8: the ONE global timeline (RULE 12, request §3/§4/§7/§8).
// Every rule here is asserted against the real pure model: cursor semantics,
// redo-branch truncation, bulk = one entry, coalescing, cap, compaction of
// stale entries, corrupt payloads and the shortcut map.
import { describe, expect, it } from "vitest";
import {
  COALESCE_MS, EMPTY_HISTORY, HISTORY_CAP, HISTORY_VERSION,
  canRedo, canUndo, dropEntries, entry, historyShortcut, moveCursor, parseHistory,
  pushEntry, redoLabel, serializeHistory, undoLabel,
  type HistoryDoc, type HistoryEntry,
} from "../src/lib/history";

let seq = 0;
function e(over: Partial<HistoryEntry> = {}): HistoryEntry {
  seq += 1;
  return entry({
    id: over.id ?? `e${seq}`, kind: over.kind ?? "review", label: over.label ?? `action ${seq}`,
    tab: over.tab ?? "selectionV2", targets: over.targets ?? ["p1"], before: over.before ?? 0,
    after: over.after ?? 1, at: over.at ?? seq * 1000, ...over,
  });
}

function doc(...entries: HistoryEntry[]): HistoryDoc {
  return { v: HISTORY_VERSION, entries, cursor: entries.length - 1 };
}

describe("entry + push", () => {
  it("fills the schema fields so every entry is traceable", () => {
    const x = entry({ kind: "review", label: "Approve 2 pairs", tab: "selectionV2", targets: ["a", "b"], before: 1, after: 2 });
    expect(x.v).toBe(HISTORY_VERSION);
    expect(x.id).toBeTruthy();
    expect(typeof x.at).toBe("number");
    expect(x.targets).toEqual(["a", "b"]);
  });

  it("appends and moves the cursor to the newest applied entry", () => {
    const d = pushEntry(EMPTY_HISTORY, e());
    expect(d.entries).toHaveLength(1);
    expect(d.cursor).toBe(0);
    expect(canUndo(d)).toBe(true);
    expect(canRedo(d)).toBe(false);
  });

  it("truncates the redo branch when a new action arrives after an undo", () => {
    const two = pushEntry(pushEntry(EMPTY_HISTORY, e({ label: "first" })), e({ label: "second" }));
    const undone = moveCursor(two, "undo")!.doc;
    expect(canRedo(undone)).toBe(true);
    const fresh = pushEntry(undone, e({ label: "new branch" }));
    expect(fresh.entries.map((x) => x.label)).toEqual(["first", "new branch"]);
    expect(canRedo(fresh)).toBe(false);
  });

  it("caps the timeline by entry count and keeps the cursor on the newest", () => {
    let d: HistoryDoc = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_CAP + 5; i++) d = pushEntry(d, e({ at: i }));
    expect(d.entries).toHaveLength(HISTORY_CAP);
    expect(d.cursor).toBe(HISTORY_CAP - 1);
    expect(d.entries[0].at).not.toBe(0); // the oldest five were dropped
  });

  it("coalesces a drag of the same field into ONE entry, but not across kinds", () => {
    const first = e({ label: "zoom 84", coalesce: "zoom", targets: ["v2"], at: 0 });
    const d1 = pushEntry(EMPTY_HISTORY, first);
    const d2 = pushEntry(d1, e({ label: "zoom 128", coalesce: "zoom", targets: ["v2"], at: 300, after: 128 }));
    expect(d2.entries).toHaveLength(1);
    expect(d2.entries[0]).toMatchObject({ label: "zoom 128", before: 0, after: 128 });
    const d3 = pushEntry(d2, e({ kind: "settings", label: "other", coalesce: "zoom", at: 400 }));
    expect(d3.entries).toHaveLength(2);
  });

  it("does not coalesce when the gesture is older than the window", () => {
    const d1 = pushEntry(EMPTY_HISTORY, e({ coalesce: "zoom", at: 0 }));
    const d2 = pushEntry(d1, e({ coalesce: "zoom", at: COALESCE_MS + 1 }));
    expect(d2.entries).toHaveLength(2);
  });

  it("never coalesces a new gesture onto an entry that was just undone", () => {
    const d = doc(e({ label: "zoom 84", coalesce: "zoom" }), e({ label: "zoom 96", coalesce: "zoom", at: 999_000 }));
    const undone = moveCursor(d, "undo")!.doc; // cursor 0: the newest entry is not applied
    const pushed = pushEntry(undone, e({ label: "zoom 128", coalesce: "zoom", at: 999_100 }));
    expect(pushed.entries).toHaveLength(2);
    expect(pushed.entries[1].label).toBe("zoom 128");
  });
});

describe("cursor moves", () => {
  it("undo walks back one applied entry and redo walks forward again", () => {
    const d = doc(e({ label: "one" }), e({ label: "two" }));
    const back = moveCursor(d, "undo")!;
    expect(back.entry.label).toBe("two");
    expect(back.doc.cursor).toBe(0);
    const fwd = moveCursor(back.doc, "redo")!;
    expect(fwd.entry.label).toBe("two");
    expect(fwd.doc.cursor).toBe(1);
  });

  it("returns null at either frontier and never mutates the document", () => {
    expect(moveCursor(EMPTY_HISTORY, "undo")).toBeNull();
    expect(moveCursor(EMPTY_HISTORY, "redo")).toBeNull();
    const d = doc(e());
    expect(moveCursor(d, "redo")).toBeNull();
    expect(d.cursor).toBe(0);
  });
});

describe("labels", () => {
  it("names the action the button will reverse (request §6)", () => {
    const d = doc(e({ label: "Approve 14 selected pairs" }));
    expect(undoLabel(d)).toBe("Undo: Approve 14 selected pairs");
    expect(redoLabel(d)).toBeNull();
    const undone = moveCursor(d, "undo")!.doc;
    expect(undoLabel(undone)).toBeNull();
    expect(redoLabel(undone)).toBe("Redo: Approve 14 selected pairs");
  });
});

describe("compaction of stale entries", () => {
  it("drops an entry without corrupting the cursor of the applied ones", () => {
    const a = e({ id: "a" }), b = e({ id: "b" }), c = e({ id: "c" });
    const d = doc(a, b, c);
    const noB = dropEntries(d, ["b"]);
    expect(noB.entries.map((x) => x.id)).toEqual(["a", "c"]);
    expect(noB.cursor).toBe(1); // a and c are still applied
    const undone = moveCursor(noB, "undo")!;
    expect(undone.entry.id).toBe("c");
  });

  it("keeps the cursor at -1 when every applied entry is dropped", () => {
    const d = doc(e({ id: "a" }));
    expect(dropEntries(d, ["a"]).cursor).toBe(-1);
  });
});

describe("persistence", () => {
  it("round-trips a document", () => {
    const d = doc(e({ id: "a", label: "Approve 2 pairs" }));
    expect(parseHistory(serializeHistory(d))).toEqual(d);
  });

  it("never persists ephemeral entries and remaps the cursor", () => {
    const a = e({ id: "a" }), live = e({ id: "b", ephemeral: true }), c = e({ id: "c" });
    const saved = parseHistory(serializeHistory(doc(a, live, c)));
    expect(saved.entries.map((x) => x.id)).toEqual(["a", "c"]);
    expect(saved.cursor).toBe(1);
  });

  it("drops ephemeral entries that were undone before the save", () => {
    const a = e({ id: "a" }), live = e({ id: "b", ephemeral: true });
    const undone = moveCursor(doc(a, live), "undo")!.doc; // cursor 0 -> only "a" applied
    const saved = parseHistory(serializeHistory(undone));
    expect(saved.entries.map((x) => x.id)).toEqual(["a"]);
    expect(saved.cursor).toBe(0);
  });

  it("returns an empty timeline for a corrupt, foreign or empty payload", () => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
    expect(parseHistory("{oops")).toEqual(EMPTY_HISTORY);
    expect(parseHistory(JSON.stringify({ v: 99, entries: [{}], cursor: 0 }))).toEqual(EMPTY_HISTORY);
    expect(parseHistory(JSON.stringify({ v: HISTORY_VERSION, entries: "x", cursor: 0 }))).toEqual(EMPTY_HISTORY);
    expect(parseHistory(JSON.stringify({ v: HISTORY_VERSION, entries: [{ id: "a" }], cursor: 0 }))).toEqual(EMPTY_HISTORY);
  });

  it("clamps a cursor that points outside the stored entries", () => {
    const good = e({ id: "a" });
    const d = parseHistory(JSON.stringify({ v: HISTORY_VERSION, entries: [good], cursor: 42 }));
    expect(d.cursor).toBe(0);
    const d2 = parseHistory(JSON.stringify({ v: HISTORY_VERSION, entries: [good], cursor: -9 }));
    expect(d2.cursor).toBe(-1);
  });
});

describe("shortcut mapping (request §6)", () => {
  const key = (k: string, mod = false, shift = false) => ({ key: k, ctrlKey: mod, metaKey: mod, shiftKey: shift, altKey: false });
  it("maps Ctrl/Cmd+Z to undo", () => {
    expect(historyShortcut(key("z", true))).toBe("undo");
    expect(historyShortcut(key("Z", true, true))).toBe("redo");
  });
  it("maps Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y to redo", () => {
    expect(historyShortcut(key("z", true, true))).toBe("redo");
    expect(historyShortcut(key("y", true))).toBe("redo");
  });
  it("ignores unmodified keys, Alt chords and other letters", () => {
    expect(historyShortcut(key("z"))).toBeNull();
    expect(historyShortcut({ ...key("z", true), altKey: true })).toBeNull();
    expect(historyShortcut(key("q", true))).toBeNull();
  });
});
