// @vitest-environment node
// session.test.ts — RULE 8/13: the restart snapshot. Every field is validated
// on read, stale ids are pruned, and a corrupt payload costs one ignored load.
//
// Deliberately narrow (one owner per value): the last batch preset is already
// persisted by saveLastName, ignoreFolders by the preset store and the V2 view
// mode + zoom by prefsstore — the session must not duplicate any of them.
import { describe, expect, it } from "vitest";
import { ALL_FILTER } from "../src/lib/reviewfilter";
import {
  TAB_IDS, DEFAULT_SESSION, parseSession, pruneIds, serializeSession, SESSION_VERSION,
} from "../src/lib/session";

const NOW = "2026-10-01T10:00:00.000Z";

const FULL = {
  v: SESSION_VERSION,
  savedAt: NOW,
  tab: "selectionV2",
  sheets: { padding: 12, size: 1024, transparent: true },
  selection: {
    filter: { ...ALL_FILTER, status: "approved" as const, search: "fog" },
    sort: { by: "name" as const, dir: "asc" as const },
    selectedId: "pair_a", collapsed: true,
    zoom: "full" as const, sync: false, autoNext: false,
  },
  selectionV2: { checked: ["pair_a", "pair_b"], scrollY: 240, anchorId: "pair_b" },
};

const asText = (over: Record<string, unknown>): string => JSON.stringify({ ...FULL, ...over });

describe("parseSession", () => {
  it("defaults when nothing has been saved yet", () => {
    expect(parseSession(null)).toEqual(DEFAULT_SESSION);
    expect(parseSession("")).toEqual(DEFAULT_SESSION);
  });

  it("rejects a corrupt payload instead of throwing (RULE 13)", () => {
    for (const bad of ["{oops", "[]", "null", '"x"', '{"v":1,"tab":{}}']) {
      expect(parseSession(bad)).toEqual(DEFAULT_SESSION);
    }
  });

  it("rejects a snapshot from another schema version", () => {
    expect(parseSession(serializeSession({ ...DEFAULT_SESSION, tab: "batch" }, NOW).replace('"v":1', '"v":99')))
      .toEqual(DEFAULT_SESSION);
  });

  it("restores every saved field", () => {
    const s = parseSession(JSON.stringify(FULL));
    expect(s.tab).toBe("selectionV2");
    expect(s.sheets).toEqual({ padding: 12, size: 1024, transparent: true });
    expect(s.selection.selectedId).toBe("pair_a");
    expect(s.selection.filter).toEqual({ ...ALL_FILTER, status: "approved", search: "fog" });
    expect(s.selection.sort).toEqual({ by: "name", dir: "asc" });
    expect(s.selection).not.toHaveProperty("collapsed");
    expect(s.selection.zoom).toBe("full");
    expect(s.selection.sync).toBe(false);
    expect(s.selection.autoNext).toBe(false);
    expect(s.selectionV2.checked).toEqual(["pair_a", "pair_b"]);
    expect(s.selectionV2.scrollY).toBe(240);
    expect(s.selectionV2.anchorId).toBe("pair_b");
  });

  it("replaces an unknown tab with the default instead of rendering nothing", () => {
    expect(parseSession(asText({ tab: "nonsense" })).tab).toBe("sheets");
    expect(parseSession(asText({ tab: 42 })).tab).toBe("sheets");
  });

  it("clamps or defaults broken numbers and booleans", () => {
    const s = parseSession(asText({
      sheets: { padding: "wide", size: -5, transparent: "yes" },
      selectionV2: { checked: [], scrollY: Number.NaN, anchorId: 7 },
    }));
    expect(s.sheets).toEqual(DEFAULT_SESSION.sheets);
    expect(s.selectionV2.scrollY).toBe(0);
    expect(s.selectionV2.anchorId).toBeNull();
  });

  it("clamps an out-of-range padding into the usable range", () => {
    expect(parseSession(asText({ sheets: { padding: 999, size: 512, transparent: false } })).sheets.padding)
      .toBe(25);
  });

  it("falls back to defaults for a damaged nested object", () => {
    const s = parseSession(asText({ selection: "gone", sheets: null }));
    expect(s.selection).toEqual(DEFAULT_SESSION.selection);
    expect(s.sheets).toEqual(DEFAULT_SESSION.sheets);
    expect(s.selection.filter).toEqual(ALL_FILTER);
  });

  it("drops non-string ids from lists", () => {
    const s = parseSession(asText({ selectionV2: { checked: ["ok", 7, null], scrollY: 0, anchorId: null } }));
    expect(s.selectionV2.checked).toEqual(["ok"]);
  });

  it("restores old sessions without an anchor without losing checked rows or active targets", () => {
    const s = parseSession(asText({
      selectionV2: { checked: ["pair_a", "pair_b"], scrollY: 16 },
      batch: { checked: ["row_a"], activeId: "row_a" },
      svg: { checked: ["svg_a"], activeId: "svg_a" },
      upload: { checked: ["upload_a"], activeId: "upload_a" },
    }));
    expect(s.selectionV2).toEqual({ checked: ["pair_a", "pair_b"], scrollY: 16, anchorId: null });
    expect(s.batch).toEqual({ checked: ["row_a"], activeId: "row_a", anchorId: null });
    expect(s.svg).toEqual({ checked: ["svg_a"], activeId: "svg_a", anchorId: null });
    expect(s.upload).toEqual({ checked: ["upload_a"], activeId: "upload_a", anchorId: null });
  });

  it("round-trips through serialize", () => {
    const s = parseSession(JSON.stringify(FULL));
    expect(parseSession(serializeSession(s, NOW))).toEqual(s);
  });
});

describe("pruneIds — stale ids never survive a rescan", () => {
  it("drops ids that no longer exist and keeps the ones that do", () => {
    expect(pruneIds(["pair_a", "pair_b", "ghost"], new Set(["pair_b"]))).toEqual(["pair_b"]);
  });

  it("keeps everything before anything has been scanned, so a restore is not wiped", () => {
    expect(pruneIds(["pair_a", "pair_b"], new Set())).toEqual(["pair_a", "pair_b"]);
  });

  it("does not hand back the caller's array", () => {
    const ids = ["pair_a"];
    expect(pruneIds(ids, new Set())).not.toBe(ids);
  });
});

describe("original Selection removal compatibility", () => {
  it("keeps only the five supported tabs", () => {
    expect(TAB_IDS).toEqual(["sheets", "batch", "selectionV2", "generateSvg", "upload"]);
  });
  it("moves old Selection sessions to V2 without losing review/check state", () => {
    const session = parseSession(asText({ tab: "selection" }));
    expect(session.tab).toBe("selectionV2");
    expect(session.selection.filter).toEqual(FULL.selection.filter);
    expect(session.selection.selectedId).toBe("pair_a");
    expect(session.selection.zoom).toBe("full");
    expect(session.selectionV2).toEqual(FULL.selectionV2);
    expect(session.selection).not.toHaveProperty("collapsed");
    expect(serializeSession(session, NOW)).not.toContain('"collapsed"');
  });
});
