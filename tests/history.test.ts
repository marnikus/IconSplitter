// history.test.ts — RULE 8/12: the ONE global undo timeline. Contracts follow
// the reference implementation's UndoStore/UndoService (see
// docs/archive/2026-10-01-history-session/design.md §1) with this app's
// before/after entry shape. Pure: no clock, no storage, no React.
import { describe, expect, it } from "vitest";
import {
  COALESCE_MS, emptyTimeline, canRedo, canUndo, HISTORY_VERSION, MAX_HISTORY,
  parseTimeline, pushCoalesced, pushEntry, redoLabel, stepForward, serializeTimeline,
  undoLabel, stepBack, type HistoryEntry, type Timeline,
} from "../src/lib/history";

const AT = "2026-10-01T10:00:00.000Z";

function E(id: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id, type: "decisions", label: `Approve ${id}`, at: AT, origin: "selectionV2",
    ids: [id], before: { [id]: "pending" }, after: { [id]: "approved" },
    v: HISTORY_VERSION, ...over,
  };
}

/** The exact same change recorded twice — e.g. the user re-applies an edit. */
const REPEAT = E("again", { ids: ["a"], label: "Approve a again", before: { a: "pending" }, after: { a: "approved" } });

function filled(n: number): Timeline {
  let t = emptyTimeline();
  for (let i = 0; i < n; i++) t = pushEntry(t, E(`e${i}`));
  return t;
}

describe("emptyTimeline", () => {
  it("starts at the frontier with nothing to undo or redo", () => {
    const t = emptyTimeline();
    expect(t).toEqual({ entries: [], index: -1 });
    expect(canUndo(t)).toBe(false);
    expect(canRedo(t)).toBe(false);
    expect(undoLabel(t)).toBeNull();
    expect(redoLabel(t)).toBeNull();
  });
});

describe("pushEntry", () => {
  it("appends and moves the cursor to the new tip", () => {
    const t = pushEntry(emptyTimeline(), E("a"));
    expect(t.entries.map((e) => e.id)).toEqual(["a"]);
    expect(t.index).toBe(0);
    expect(canUndo(t)).toBe(true);
    expect(canRedo(t)).toBe(false);
  });

  it("a new action after undo clears the redo branch", () => {
    let t = pushEntry(pushEntry(emptyTimeline(), E("a")), E("b"));
    t = stepBack(t).timeline;
    expect(t.index).toBe(0);
    t = pushEntry(t, E("c"));
    expect(t.entries.map((e) => e.id)).toEqual(["a", "c"]); // "b" is gone for good
    expect(t.index).toBe(1);
    expect(canRedo(t)).toBe(false);
  });

  it("skips a consecutive duplicate so a repeated identical edit is one entry", () => {
    const once = pushEntry(emptyTimeline(), E("a"));
    const twice = pushEntry(once, REPEAT); // same change, brand-new action id
    expect(twice.entries).toHaveLength(1);
    expect(twice.index).toBe(0);
  });

  it("keeps a different value as its own entry", () => {
    const t = pushEntry(pushEntry(emptyTimeline(), E("a")), E("a", { after: { a: "declined" } }));
    expect(t.entries).toHaveLength(2);
  });

  it("caps the history and shifts the cursor so it still points at the same entry", () => {
    let t = emptyTimeline();
    for (let i = 0; i < MAX_HISTORY + 5; i++) t = pushEntry(t, E(`e${i}`));
    expect(t.entries).toHaveLength(MAX_HISTORY);
    expect(t.index).toBe(MAX_HISTORY - 1);
    expect(t.entries[0].id).toBe("e5"); // the 5 oldest were dropped
    expect(t.entries[MAX_HISTORY - 1].id).toBe(`e${MAX_HISTORY + 4}`);
  });

  it("drops the oldest when the cap bites and leaves the cursor on the new action", () => {
    const t = pushEntry(filled(4), E("x"), 3); // [e0..e3] pushed over a cap of 3
    expect(t.entries.map((e) => e.id)).toEqual(["e2", "e3", "x"]);
    expect(t.index).toBe(2);
    expect(t.entries[t.index].id).toBe("x");
    expect(stepBack(t).entry?.id).toBe("x"); // undo still walks back from the tip
  });
});

describe("pushCoalesced — one entry per gesture", () => {
  const t0 = pushEntry(emptyTimeline(), E("zoom", { type: "view-prefs", ids: ["thumbHeight"], before: 84, after: 90 }));

  it("replaces the tip's after while the same control keeps moving", () => {
    const t = pushCoalesced(t0, E("zoom2", { type: "view-prefs", ids: ["thumbHeight"], before: 90, after: 128 }), Date.parse(AT) + 200);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].before).toBe(84); // the value the gesture started from
    expect(t.entries[0].after).toBe(128); // …and where it ended
  });

  it("starts a new entry once the gesture window has passed", () => {
    const t = pushCoalesced(t0, E("zoom2", { type: "view-prefs", ids: ["thumbHeight"], before: 90, after: 128 }), Date.parse(AT) + COALESCE_MS + 1);
    expect(t.entries).toHaveLength(2);
  });

  it("never coalesces a different control or a different kind", () => {
    const other = E("z", { type: "view-prefs", ids: ["mode"], before: "list", after: "compare" });
    expect(pushCoalesced(t0, other, Date.parse(AT) + 10).entries).toHaveLength(2);
    const kind = E("z", { type: "decisions", ids: ["thumbHeight"], before: 84, after: 90 });
    expect(pushCoalesced(t0, kind, Date.parse(AT) + 10).entries).toHaveLength(2);
  });
});

describe("stepBack / stepForward", () => {
  it("undo hands back the entry whose BEFORE must be applied", () => {
    const t = filled(2);
    const u = stepBack(t);
    expect(u.entry?.id).toBe("e1");
    expect(u.entry?.before).toEqual({ e1: "pending" });
    expect(u.timeline.index).toBe(0);
  });

  it("undo at the first entry lands on the frontier and still restores its before", () => {
    const u = stepBack(filled(1));
    expect(u.entry?.id).toBe("e0");
    expect(u.timeline.index).toBe(-1);
    expect(canUndo(u.timeline)).toBe(false);
  });

  it("undo at the frontier does nothing and does not move the cursor", () => {
    const u = stepBack(emptyTimeline());
    expect(u.entry).toBeNull();
    expect(u.timeline.index).toBe(-1);
  });

  it("redo reapplies the AFTER of the next entry", () => {
    const undone = stepBack(filled(2)).timeline;
    const r = stepForward(undone);
    expect(r.entry?.id).toBe("e1");
    expect(r.entry?.after).toEqual({ e1: "approved" });
    expect(r.timeline.index).toBe(1);
  });

  it("redo at the tip does nothing", () => {
    const r = stepForward(filled(2));
    expect(r.entry).toBeNull();
    expect(r.timeline.index).toBe(1);
  });

  it("undo then redo returns to exactly the same timeline", () => {
    const t = filled(3);
    expect(stepForward(stepBack(t).timeline).timeline).toEqual(t);
  });

  it("labels describe the next action in each direction", () => {
    const t = filled(2);
    expect(undoLabel(t)).toBe("Approve e1");
    expect(redoLabel(t)).toBeNull();
    const u = stepBack(t).timeline;
    expect(undoLabel(u)).toBe("Approve e0");
    expect(redoLabel(u)).toBe("Approve e1");
  });
});

describe("parseTimeline / serializeTimeline", () => {
  it("round-trips a timeline", () => {
    const t = stepBack(filled(3)).timeline;
    expect(parseTimeline(serializeTimeline(t))).toEqual(t);
  });

  it("falls back to an empty timeline for absent or corrupt payloads (RULE 13)", () => {
    expect(parseTimeline(null)).toEqual(emptyTimeline());
    expect(parseTimeline("")).toEqual(emptyTimeline());
    expect(parseTimeline("{nope")).toEqual(emptyTimeline());
    expect(parseTimeline("[]")).toEqual(emptyTimeline());
    expect(parseTimeline('{"entries":"x","index":0}')).toEqual(emptyTimeline());
  });

  it("rejects a payload from another schema version", () => {
    const now = '"v":' + HISTORY_VERSION;
    const next = '"v":' + (HISTORY_VERSION + 1);
    const text = serializeTimeline(filled(2)).replace(now, next);
    expect(text).toContain(next);
    expect(parseTimeline(text)).toEqual(emptyTimeline());
  });

  it("clamps an out-of-range cursor instead of trusting it", () => {
    const good = serializeTimeline(filled(2));
    expect(parseTimeline(good.replace('"index":1', '"index":99')).index).toBe(1);
    expect(parseTimeline(good.replace('"index":1', '"index":-7')).index).toBe(-1);
    expect(parseTimeline(good.replace('"index":1', '"index":"x"')).index).toBe(1);
  });

  it("drops malformed entries rather than crashing on them later", () => {
    const broken = '{"v":1,"index":0,"entries":[{"id":"a"},{"id":"b","type":"t","label":"l","at":"x","origin":"o","ids":[],"before":1,"after":2,"v":1}]}';
    const t = parseTimeline(broken);
    expect(t.entries.map((e) => e.id)).toEqual(["b"]);
    expect(t.index).toBe(0);
  });
});
