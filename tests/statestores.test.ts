// statestores.test.ts — the two localStorage owners behind restart + undo.
// Parsing is covered in lib/session + lib/history; this checks the IO contract:
// round-trip, corrupt tolerance and a storage that refuses to write.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTimeline, pushEntry, stepBack, HISTORY_VERSION, type HistoryEntry } from "../src/lib/history";
import { DEFAULT_SESSION } from "../src/lib/session";
import { HISTORY_KEY, loadHistory, saveHistory } from "../src/state/historystore";
import { loadSessionState, SESSION_KEY, saveSessionState } from "../src/state/sessionstore";

const NOW = "2026-10-01T12:00:00.000Z";

const ENTRY: HistoryEntry = {
  id: "act", type: "sheets", label: "Padding 12%", at: NOW, origin: "sheets",
  ids: ["padding"], before: { padding: 6 }, after: { padding: 12 }, v: HISTORY_VERSION,
};
// A second, different change — an identical repeat would collapse into one entry.
const ENTRY2: HistoryEntry = { ...ENTRY, id: "act2", label: "Padding 20%", after: { padding: 20 } };

beforeEach(() => localStorage.clear());

describe("history store", () => {
  it("starts empty", () => {
    expect(loadHistory()).toEqual(emptyTimeline());
  });

  it("round-trips entries and the cursor position", () => {
    const t = stepBack(pushEntry(pushEntry(emptyTimeline(), ENTRY), ENTRY2)).timeline;
    saveHistory(t);
    expect(loadHistory()).toEqual(t);
    expect(loadHistory().index).toBe(0); // mid-timeline: redo is still available
    expect(loadHistory().entries).toHaveLength(2);
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem(HISTORY_KEY, "{oops");
    expect(loadHistory()).toEqual(emptyTimeline());
  });
});

describe("session store", () => {
  it("defaults when nothing is stored", () => {
    expect(loadSessionState()).toEqual(DEFAULT_SESSION);
  });

  it("round-trips the snapshot", () => {
    saveSessionState({ ...DEFAULT_SESSION, tab: "selectionV2" }, NOW);
    expect(loadSessionState().tab).toBe("selectionV2");
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem(SESSION_KEY, "[]");
    expect(loadSessionState()).toEqual(DEFAULT_SESSION);
  });
});

describe("blocked storage (private mode)", () => {
  it("never throws and simply does not persist", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => saveHistory(pushEntry(emptyTimeline(), ENTRY))).not.toThrow();
    expect(() => saveSessionState(DEFAULT_SESSION, NOW)).not.toThrow();
    vi.restoreAllMocks();
    expect(loadHistory()).toEqual(emptyTimeline());
  });
});
