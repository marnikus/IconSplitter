// appstore.test.ts — the store that lives ABOVE the tabs. Workbench renders one
// panel at a time, so panel-local useState cannot be the owner of anything a
// global undo/redo or a restart must see (RULE 12; design doc §2).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION } from "../src/lib/session";
import {
  getAppState, initialAppState, patchV2, patchView, resetAppStore, sessionOf,
  setAppState, subscribe,
} from "../src/state/appstore";

beforeEach(() => resetAppStore());

describe("initialAppState", () => {
  it("lifts a restored session into the store and keeps prefs separate", () => {
    const s = initialAppState({ ...DEFAULT_SESSION, tab: "batch" }, { mode: "compare", thumbHeight: 120 });
    expect(s.tab).toBe("batch");
    expect(s.view).toEqual(DEFAULT_SESSION.selection);
    expect(s.v2).toEqual(DEFAULT_SESSION.selectionV2);
    expect(s.prefs).toEqual({ mode: "compare", thumbHeight: 120 });
  });
});

describe("mutations", () => {
  it("merges a partial state and notifies subscribers", () => {
    const spy = vi.fn();
    const off = subscribe(spy);
    setAppState({ tab: "selection" });
    expect(getAppState().tab).toBe("selection");
    expect(getAppState().view).toEqual(DEFAULT_SESSION.selection); // untouched slices survive
    expect(spy).toHaveBeenCalledTimes(1);
    off();
    setAppState({ tab: "sheets" });
    expect(spy).toHaveBeenCalledTimes(1); // unsubscribed
  });

  it("patches only the shared view slice", () => {
    patchView({ selectedId: "pair_a", collapsed: true });
    expect(getAppState().view).toMatchObject({ selectedId: "pair_a", collapsed: true, autoNext: true });
    expect(getAppState().v2.checked).toEqual([]);
  });

  it("patches only the V2 slice", () => {
    patchV2({ checked: ["a"], scrollY: 40, anchorId: "a" });
    expect(getAppState().v2).toEqual({ checked: ["a"], scrollY: 40, anchorId: "a" });
    expect(getAppState().view.selectedId).toBeNull();
  });

  it("never mutates the previous state object", () => {
    const before = getAppState();
    patchView({ selectedId: "x" });
    expect(before.view.selectedId).toBeNull();
  });

  it("resetAppStore returns to the initial state and can install a restored one", () => {
    setAppState({ tab: "selectionV2" });
    resetAppStore();
    expect(getAppState().tab).toBe("sheets");
    const restored = initialAppState({ ...DEFAULT_SESSION, tab: "selectionV2" }, getAppState().prefs);
    resetAppStore(restored);
    expect(getAppState()).toBe(restored);
  });
});

describe("sessionOf — the projection that gets persisted", () => {
  it("keeps everything the restart needs", () => {
    setAppState({ tab: "selectionV2" });
    patchView({ selectedId: "pair_a" });
    patchV2({ checked: ["pair_a"], scrollY: 12, anchorId: "pair_a" });
    expect(sessionOf(getAppState())).toEqual({ ...DEFAULT_SESSION, tab: "selectionV2", selection: { ...DEFAULT_SESSION.selection, selectedId: "pair_a" }, selectionV2: { checked: ["pair_a"], scrollY: 12, anchorId: "pair_a" } });
  });

  it("leaves prefs out, because prefsstore already owns them", () => {
    setAppState({ prefs: { mode: "compare", thumbHeight: 200 } });
    expect(JSON.stringify(sessionOf(getAppState()))).not.toContain("thumbHeight");
  });
});
