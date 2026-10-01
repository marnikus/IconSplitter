// selectionstore.test.ts — RULE 8 / request §2/§3/§9: the review command layer
// through the real store: one bulk command = one history entry, undo/redo
// replaying through the same transition a click uses, reset-to-pending,
// persistence failure handling, stale-target compaction and the session mirror.
import { beforeEach, describe, expect, it } from "vitest";
import { getHistorySnapshot, redo, resetHistoryForTests, undo } from "../src/history/historybus";
import { DEFAULT_SORT } from "../src/lib/reviewsort";
import { ALL_FILTER } from "../src/lib/reviewfilter";
import { reviewPair } from "./helpers/reviewpairs";
import { registerSelectionHistory } from "../src/selection/selectionhistory";
import {
  getSelState, resetSelectionStoreForTests, scanState, setDecisionWriter, subscribeSel,
} from "../src/selection/selectionstore";
import {
  checkVisibleCommand, decideBulkCommand, decideCommand, patchCommand, resetCommand,
  sayCommand, selectCommand, setFilterCommand, setSortCommand, setThumbCommand, setViewCommand,
  toggleCheckCommand, uncheckAllCommand,
} from "../src/selection/selectioncommands";
import { ensureSelectionMirror, resetSelectionMirrorForTests } from "../src/session/selectionmirror";
import { getSession, resetSessionStoreForTests } from "../src/session/sessionstore";
import { resetScrollMemoForTests } from "../src/session/scrollmemo";

const NOW = "2026-10-01T12:00:00.000Z";

/** Lets the fire-and-forget decision write finish before asserting the file. */
const settle = () => new Promise((r) => setTimeout(r, 0));

let written: { pair_id: string }[] = [];
let failWrite = false;

beforeEach(() => {
  localStorage.clear();
  written = [];
  failWrite = false;
  resetHistoryForTests();
  resetSessionStoreForTests();
  resetSelectionMirrorForTests();
  resetScrollMemoForTests();
  resetSelectionStoreForTests();
  registerSelectionHistory();
  setDecisionWriter(async (records) => {
    if (failWrite) throw new Error("disk full");
    written = records.map((r) => ({ pair_id: r.pair_id }));
  });
  scanState([reviewPair("a"), reviewPair("b"), reviewPair("c")], { records: [], corrupt: false }, 1);
});

const entries = () => getHistorySnapshot().doc.entries;
const decisions = () => getSelState().pairs.map((p) => `${p.pairId}:${p.decision}`);

describe("review decisions (request §3)", () => {
  it("records one entry for a single approve and replays it both ways", async () => {
    decideCommand("a", "approved", NOW);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ kind: "review", label: "Approve “a”", targets: ["a"], tab: "selection" });
    expect(entries()[0].before).toEqual([{ id: "a", decision: "pending", reviewedAt: null }]);
    expect(undo()).toMatchObject({ ok: true, direction: "undo" });
    await settle();
    expect(decisions()).toEqual(["a:pending", "b:pending", "c:pending"]);
    expect(written).toEqual([]); // undo writes the file back, so it stays truthful
    expect(redo()).toMatchObject({ ok: true, direction: "redo" });
    expect(decisions()).toEqual(["a:approved", "b:pending", "c:pending"]);
  });

  it("records one bulk approve as ONE entry with the complete before state", async () => {
    await decideBulkCommand(["a", "b", "c"], "approved", NOW);
    expect(entries()).toHaveLength(1);
    expect(entries()[0].label).toBe("Approve 3 pairs");
    expect(entries()[0].targets).toEqual(["a", "b", "c"]);
    expect(undo()).toMatchObject({ ok: true });
    await settle();
    expect(decisions()).toEqual(["a:pending", "b:pending", "c:pending"]);
    expect(written).toEqual([]); // one undo = the whole bulk action reversed
  });

  it("does not create a history entry for a decision the pair already has", () => {
    decideCommand("a", "approved", NOW);
    decideCommand("a", "approved", NOW);
    expect(entries()).toHaveLength(2); // a real second command is a second action
    expect(entries()[1].before).toEqual(entries()[1].after);
  });

  it("keeps the records file in sync with the replay", async () => {
    await decideBulkCommand(["a", "b"], "declined", NOW);
    expect(written.map((r) => r.pair_id).sort()).toEqual(["a", "b"]);
    undo();
    await settle();
    expect(written).toEqual([]);
  });
});

describe("reset to pending (request §2)", () => {
  it("resets one approved item and is itself undoable", async () => {
    decideCommand("a", "approved", NOW);
    await resetCommand(["a"]);
    expect(decisions()).toEqual(["a:pending", "b:pending", "c:pending"]);
    expect(getSelState().toast?.msg).toBe("1 pair reset to pending");
    expect(entries().at(-1)?.label).toBe("Reset “a”");
    undo();
    expect(decisions()).toEqual(["a:approved", "b:pending", "c:pending"]);
  });

  it("resets a bulk scope as one entry with one summary message", async () => {
    await decideBulkCommand(["a", "b", "c"], "declined", NOW);
    await resetCommand(["a", "b", "c", "pending-one"]);
    expect(entries()).toHaveLength(2); // approve-bulk + reset-bulk, never one per item
    expect(entries()[1]).toMatchObject({ label: "Reset 3 pairs to pending", targets: ["a", "b", "c"] });
    expect(getSelState().toast?.msg).toBe("3 pairs reset to pending · 1 skipped (already pending or gone)");
    undo();
    expect(decisions()).toEqual(["a:declined", "b:declined", "c:declined"]);
  });

  it("reports an honest no-op when nothing is reviewed", async () => {
    const applied = await resetCommand(["a"]);
    expect(applied).toBe(0);
    expect(entries()).toHaveLength(0);
    expect(getSelState().toast?.msg).toContain("No reviewed pairs to reset");
  });
});

describe("checkbox selection (request §3)", () => {
  it("undoes a single check and a bulk select-visible as separate entries", () => {
    toggleCheckCommand("a");
    checkVisibleCommand(["b", "c"]);
    expect(entries()).toHaveLength(2);
    expect(entries()[0]).toMatchObject({ kind: "review-checks", label: "Check “a”" });
    expect(entries()[1].label).toBe("Select visible (2 pairs)");
    expect(getSelState().checked).toEqual(["a", "b", "c"]);
    undo();
    expect(getSelState().checked).toEqual(["a"]);
    undo();
    expect(getSelState().checked).toEqual([]);
  });

  it("treats deselect-all as one entry and never records a no-op", () => {
    checkVisibleCommand(["a", "b"]);
    uncheckAllCommand();
    expect(entries()).toHaveLength(2);
    expect(entries()[1].label).toBe("Deselect all (2 pairs)");
    uncheckAllCommand();
    expect(entries()).toHaveLength(2); // nothing was checked: no entry
    undo();
    expect(getSelState().checked).toEqual(["a", "b"]);
    redo();
    expect(getSelState().checked).toEqual([]);
  });
});

describe("persisted view settings (request §3)", () => {
  it("undoes filters and sorting through the store", () => {
    setFilterCommand({ ...ALL_FILTER, status: "approved" });
    setSortCommand({ by: "name", dir: "asc" });
    expect(entries().map((e) => e.label)).toEqual(["Filter: approved", "Sort: name (asc)"]);
    undo();
    expect(getSelState().sort).toEqual(DEFAULT_SORT);
    undo();
    expect(getSelState().filter).toEqual(ALL_FILTER);
  });

  it("coalesces a zoom drag into one entry and reapplies it on redo", () => {
    setThumbCommand(96);
    setThumbCommand(128);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ label: "Zoom: 128 px", coalesce: "thumb" });
    undo();
    expect(getSelState().prefs.thumbHeight).toBe(84);
    redo();
    expect(getSelState().prefs.thumbHeight).toBe(128);
  });

  it("never records reporting state (busy, toast) or navigation", () => {
    patchCommand({ busy: "Scanning…", toast: { msg: "hi" } });
    selectCommand("b");
    sayCommand("said something");
    expect(entries()).toHaveLength(0);
    expect(getSelState().selectedId).toBe("b");
  });

  it("records a watcher toggle as one reversible view change", () => {
    setViewCommand({ watcher: false }, "Watcher: paused");
    expect(entries()).toHaveLength(1);
    undo();
    expect(getSelState().watcher).toBe(true);
  });
});

describe("persistence failures (request §2/§4)", () => {
  it("keeps the change in memory, reports it and retries", async () => {
    failWrite = true;
    await decideBulkCommand(["a"], "approved", NOW);
    expect(decisions()).toEqual(["a:approved", "b:pending", "c:pending"]);
    expect(getSelState().writeWarn).toContain("could not be written");
    expect(getSelState().toast?.msg).toContain("save failed — retry");
    failWrite = false;
    setDecisionWriter(async (records) => { written = records.map((r) => ({ pair_id: r.pair_id })); });
    await (await import("../src/selection/selectionstore")).retryDecisionWrite();
    expect(getSelState().writeWarn).toBeNull();
    expect(written.map((r) => r.pair_id)).toEqual(["a"]);
  });
});

describe("stale targets and the redo branch (request §4)", () => {
  it("compacts an entry whose pair a rescan removed and undoes the next one", () => {
    decideCommand("a", "approved", NOW);
    decideCommand("b", "approved", NOW);
    scanState([reviewPair("a")], { records: getSelState().records, corrupt: false }, 2);
    const out = undo();
    expect(out).toMatchObject({ ok: true, dropped: 1 });
    expect(decisions()).toEqual(["a:pending"]);
  });

  it("clears the redo branch with a new action after an undo", () => {
    decideCommand("a", "approved", NOW);
    undo();
    decideCommand("a", "declined", NOW);
    expect(entries().map((e) => e.label)).toEqual(["Decline “a”"]);
    expect(redo()).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("one shared state (request §9)", () => {
  it("notifies every subscriber, so two review surfaces cannot drift", () => {
    const seen: string[][] = [];
    const off = subscribeSel(() => seen.push(getSelState().checked));
    toggleCheckCommand("a");
    checkVisibleCommand(["b"]);
    off();
    expect(seen).toEqual([["a"], ["a", "b"]]);
  });

  it("mirrors view state into the session so a restart can restore it", () => {
    ensureSelectionMirror();
    setFilterCommand({ ...ALL_FILTER, status: "declined" });
    toggleCheckCommand("b");
    expect(getSession().review).toMatchObject({
      filter: { status: "declined" }, checked: ["b"], rootName: "",
    });
  });
});
