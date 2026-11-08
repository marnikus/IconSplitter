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

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function refuseLocalStorageWrites(reason = "quota"): void {
  const backing = window.localStorage;
  vi.stubGlobal("localStorage", {
    get length() { return backing.length; },
    clear: backing.clear.bind(backing),
    getItem: backing.getItem.bind(backing),
    key: backing.key.bind(backing),
    removeItem: backing.removeItem.bind(backing),
    setItem: () => { throw new Error(reason); },
  } satisfies Storage);
}

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
    expect(saveSessionState({ ...DEFAULT_SESSION, tab: "selectionV2" }, NOW)).toBe("local");
    expect(loadSessionState().tab).toBe("selectionV2");
  });

  it("falls back to the per-tab session store when localStorage refuses, including over a stale local snapshot", () => {
    saveSessionState({ ...DEFAULT_SESSION, tab: "sheets" }, NOW);
    refuseLocalStorageWrites("quota");
    expect(saveSessionState({ ...DEFAULT_SESSION, tab: "batch" }, "2026-10-01T12:01:00.000Z")).toBe("session");
    vi.restoreAllMocks();
    expect(loadSessionState().tab).toBe("batch");
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem(SESSION_KEY, "[]");
    expect(loadSessionState()).toEqual(DEFAULT_SESSION);
  });
});

describe("blocked storage (private mode)", () => {
  it("keeps session state through reload when localStorage refuses it", () => {
    refuseLocalStorageWrites("denied");
    expect(() => saveHistory(pushEntry(emptyTimeline(), ENTRY))).not.toThrow();
    expect(saveSessionState({ ...DEFAULT_SESSION, tab: "stockUpload" }, NOW)).toBe("session");
    vi.restoreAllMocks();
    expect(loadHistory()).toEqual(emptyTimeline());
    expect(loadSessionState().tab).toBe("stockUpload");
  });

  it("reports that neither storage area is usable instead of throwing", () => {
    refuseLocalStorageWrites("denied");
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(saveSessionState({ ...DEFAULT_SESSION, tab: "batch" }, NOW)).toBe("unavailable");
    vi.restoreAllMocks();
    expect(loadSessionState()).toEqual(DEFAULT_SESSION);
  });
});
