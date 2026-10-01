// historybus.test.ts — RULE 8 / request §3/§4/§8: the app-wide timeline through
// its real bus: one bulk command = one entry, undo/redo replay through the
// registered applier, stale targets compacted without corrupting the cursor,
// a failed apply that changes nothing, and persistence across a "restart".
import { beforeEach, describe, expect, it } from "vitest";
import { entry, type HistoryEntry } from "../src/lib/history";
import {
  clearAppliersForTests, getHistorySnapshot, hasApplier, recordEntry, redo, registerApplier,
  resetHistoryForTests, undo,
} from "../src/history/historybus";
import { HISTORY_KEY } from "../src/history/historystore";

interface Call {
  id: string;
  dir: string;
  value: unknown;
}

let calls: Call[] = [];
let live = new Set(["p1", "p2", "p3"]);
let failNext = false;

function setup(): void {
  localStorage.clear();
  calls = [];
  live = new Set(["p1", "p2", "p3"]);
  failNext = false;
  resetHistoryForTests();
  clearAppliersForTests();
  registerApplier("review", {
    canApply: (e) => e.targets.every((t) => live.has(t)),
    apply: (e, dir) => {
      if (failNext) return false;
      calls.push({ id: e.id, dir, value: dir === "undo" ? e.before : e.after });
      return true;
    },
  });
}

function review(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return entry({
    kind: "review", label: "Approve 3 pairs", tab: "selectionV2", targets: ["p1", "p2", "p3"],
    before: "pending", after: "approved", ...over,
  });
}

beforeEach(setup);

describe("one bulk command = one entry (request §3)", () => {
  it("records a 3-target bulk action as a single entry and replays it once", () => {
    recordEntry(review());
    expect(getHistorySnapshot().doc.entries).toHaveLength(1);
    expect(undo()).toMatchObject({ ok: true, direction: "undo" });
    expect(calls).toEqual([{ id: getHistorySnapshot().doc.entries[0].id, dir: "undo", value: "pending" }]);
    expect(redo()).toMatchObject({ ok: true, direction: "redo" });
    expect(calls[1]).toMatchObject({ dir: "redo", value: "approved" });
  });

  it("exposes the next action for the control label (request §6)", () => {
    recordEntry(review({ label: "Approve 14 selected pairs" }));
    expect(getHistorySnapshot().doc.entries[0].label).toBe("Approve 14 selected pairs");
  });

  it("clears the redo branch when a new action is recorded after an undo", () => {
    recordEntry(review({ id: "a", label: "first" }));
    recordEntry(review({ id: "b", label: "undone" }));
    undo(); // "undone" is now redoable
    recordEntry(review({ id: "c", label: "replacement" }));
    expect(getHistorySnapshot().doc.entries.map((e) => e.label)).toEqual(["first", "replacement"]);
    expect(redo()).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("stale and unavailable entries (request §4/§8)", () => {
  it("compacts an entry whose targets a rescan deleted and undoes the next one", () => {
    recordEntry(review({ id: "a", label: "old", targets: ["p1"] }));
    recordEntry(review({ id: "b", label: "new", targets: ["p2"] }));
    live.delete("p2"); // the pair behind the newest entry is gone
    const out = undo();
    expect(out).toMatchObject({ ok: true, dropped: 1 });
    expect(calls.at(-1)?.id).toBe("a");
    expect(getHistorySnapshot().doc.entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("reports an empty timeline when every entry became stale", () => {
    recordEntry(review({ id: "a", targets: ["p1"] }));
    live.clear();
    expect(undo()).toMatchObject({ ok: false, reason: "empty", dropped: 1 });
    expect(getHistorySnapshot().doc.entries).toHaveLength(0);
  });

  it("compacts entries whose kind has no applier at all", () => {
    recordEntry(review({ id: "x", kind: "ghost" }));
    expect(undo()).toMatchObject({ ok: false, reason: "empty" });
    expect(hasApplier("ghost")).toBe(false);
  });
});

describe("failed apply (request §4)", () => {
  it("keeps the cursor and the entry when the applier refuses", () => {
    recordEntry(review({ id: "a" }));
    recordEntry(review({ id: "b", label: "second" }));
    failNext = true;
    const out = undo();
    expect(out).toMatchObject({ ok: false, reason: "failed" });
    expect(getHistorySnapshot().doc.cursor).toBe(1); // unchanged
    expect(getHistorySnapshot().last?.text).toContain("nothing was changed");
    failNext = false;
    expect(undo()).toMatchObject({ ok: true }); // the retry still reverses the newest applied entry
    expect(calls.at(-1)?.id).toBe("b");
  });
});

describe("persistence across a restart (request §8)", () => {
  it("writes the timeline and reloads it on a fresh bus", () => {
    recordEntry(review({ id: "a", label: "Approve 14 selected pairs" }));
    expect(localStorage.getItem(HISTORY_KEY)).toContain("Approve 14 selected pairs");
    const before = getHistorySnapshot().doc;
    resetHistoryForTests();
    expect(getHistorySnapshot().doc).toEqual(before);
  });

  it("starts empty instead of throwing when the stored payload is corrupt", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    resetHistoryForTests();
    expect(getHistorySnapshot().doc.entries).toEqual([]);
    recordEntry(review());
    expect(getHistorySnapshot().doc.entries).toHaveLength(1);
  });

  it("never stores ephemeral entries but keeps them undoable in-session", () => {
    registerApplier("batch-select", {
      canApply: () => true,
      apply: () => true,
    });
    recordEntry(review({ id: "e1", kind: "batch-select", ephemeral: true, label: "Select 3 rows" }));
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).entries).toHaveLength(0);
    expect(undo()).toMatchObject({ ok: true });
  });
});
