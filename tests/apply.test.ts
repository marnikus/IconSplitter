// @vitest-environment node
// apply.test.ts — the canonical undo/redo mutation path (design doc §3).
// Every tracked kind is applied here; a value that does not fit is refused so
// the history cursor can stay where it was.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEntry, ENTRY_TYPES } from "../src/state/apply";
import { applyDecisionPatch } from "../src/selection/offline";
import { bindSvgReviewApplier } from "../src/svg/reviewundo";
import { pruneChecked as pruneSvgChecked } from "../src/svg/rowmodel";
import { pruneChecked as pruneUploadChecked } from "../src/upload/rowmodel";

// The decision branch writes real files; here we only assert the routing.
vi.mock("../src/selection/offline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/selection/offline")>();
  return { ...actual, applyDecisionPatch: vi.fn(async () => true) };
});

const applyDecisionsSpy = vi.mocked(applyDecisionPatch);
import { getAppState, patchSvg, patchUpload, patchV2, patchView, resetAppStore, setAppState } from "../src/state/appstore";
import { DEFAULT_SESSION } from "../src/lib/session";
import { HISTORY_VERSION, type HistoryEntry } from "../src/lib/history";

beforeEach(() => {
  resetAppStore();
  applyDecisionsSpy.mockClear();
});

const entry = (type: string, ids: string[] = ["pair_a"]): HistoryEntry => ({
  id: "act", type, label: "Do it", at: "2026-10-01T12:00:00.000Z",
  origin: "selectionV2", ids, before: null, after: null, v: HISTORY_VERSION,
});

describe("applyEntry", () => {
  it("routes a decision through the selection apply path with the touched ids", async () => {
    const patch = { recs: [{ pair_id: "pair_a", source: "a.png", ai_result: null, decision: "approved" as const, reviewed_at: "t" }] };
    await expect(applyEntry(entry("decisions"), patch)).resolves.toBe(true);
    expect(applyDecisionsSpy).toHaveBeenCalledWith(["pair_a"], patch);
  });

  it("refuses a decision payload without records", async () => {
    await expect(applyEntry(entry("decisions"), { nope: 1 })).resolves.toBe(false);
    expect(applyDecisionsSpy).not.toHaveBeenCalled();
  });

  it("restores a selection together with its shift anchor", async () => {
    await expect(applyEntry(entry("checked"), { ids: ["a", "b"], anchor: "b" })).resolves.toBe(true);
    expect(getAppState().v2).toMatchObject({ checked: ["a", "b"], anchorId: "b" });
    await expect(applyEntry(entry("checked"), { ids: ["a", 3], anchor: null })).resolves.toBe(false);
    expect(getAppState().v2.checked).toEqual(["a", "b"]); // refused, so unchanged
  });

  it("still applies an entry recorded before the anchor existed", async () => {
    await expect(applyEntry(entry("checked"), ["c"])).resolves.toBe(true);
    expect(getAppState().v2).toMatchObject({ checked: ["c"], anchorId: null });
  });

  it("applies a new SVG checkbox entry only to SVG state, never to Selection V2", async () => {
    patchV2({ checked: ["v2_keep"], anchorId: "v2_keep" });
    await expect(applyEntry(entry("svgChecked", ["svg_a"]), { ids: ["svg_a"], active: "svg_a", anchor: "svg_a" })).resolves.toBe(true);
    expect(getAppState().svg).toEqual({ checked: ["svg_a"], activeId: "svg_a", anchorId: "svg_a" });
    expect(getAppState().v2).toMatchObject({ checked: ["v2_keep"], anchorId: "v2_keep" });
  });

  it("routes pre-fix checked entries from Generate SVG back to SVG, retaining old active target", async () => {
    patchSvg({ activeId: "svg_keep" });
    patchV2({ checked: ["v2_keep"] });
    const legacy = { ...entry("checked", ["svg_old"]), origin: "generateSvg" };
    await expect(applyEntry(legacy, { ids: ["svg_old"] })).resolves.toBe(true);
    expect(getAppState().svg).toEqual({ checked: ["svg_old"], activeId: "svg_keep", anchorId: null });
    expect(getAppState().v2.checked).toEqual(["v2_keep"]);
  });

  it("applies upload checkbox history to upload only, including the active target", async () => {
    patchUpload({ checked: ["upload_old"], activeId: "upload_old" });
    patchV2({ checked: ["v2_keep"] });
    await expect(applyEntry(entry("uploadChecked", ["upload_new"]), { ids: ["upload_new"], active: "upload_new", anchor: "upload_new" })).resolves.toBe(true);
    expect(getAppState().upload).toEqual({ checked: ["upload_new"], activeId: "upload_new", anchorId: "upload_new" });
    expect(getAppState().v2.checked).toEqual(["v2_keep"]);
    await expect(applyEntry(entry("uploadChecked"), { ids: ["invalid", 7] })).resolves.toBe(false);
    expect(getAppState().upload).toEqual({ checked: ["upload_new"], activeId: "upload_new", anchorId: "upload_new" });
  });

  it("refuses selection undo snapshots that resurrect rows removed by a scan", async () => {
    pruneSvgChecked([{ source: { id: "svg_keep" } }] as unknown as Parameters<typeof pruneSvgChecked>[0]);
    pruneUploadChecked([{ source: { id: "upload_keep" } }] as unknown as Parameters<typeof pruneUploadChecked>[0]);
    const svgBefore = getAppState().svg;
    const uploadBefore = getAppState().upload;
    const stale = (id: string) => ({ ids: [id], active: id, anchor: id });
    await expect(applyEntry(entry("svgChecked"), stale("svg_removed"))).resolves.toBe(false);
    await expect(applyEntry(entry("uploadChecked"), stale("upload_removed"))).resolves.toBe(false);
    expect(getAppState().svg).toEqual(svgBefore);
    expect(getAppState().upload).toEqual(uploadBefore);
    const legacySvg = { ...entry("checked"), origin: "generateSvg" };
    await expect(applyEntry(legacySvg, { ids: ["svg_removed"] })).resolves.toBe(false);
    await expect(applyEntry(entry("svgChecked"), stale("svg_keep"))).resolves.toBe(true);
    await expect(applyEntry(entry("uploadChecked"), stale("upload_keep"))).resolves.toBe(true);
    pruneSvgChecked([]);
    await expect(applyEntry(entry("svgChecked"), stale("svg_keep"))).resolves.toBe(false);
  });

  it("restores the SVG warning review status used by W and the row button", async () => {
    const seen: unknown[] = [];
    const unbind = bindSvgReviewApplier(async (patch) => { seen.push(patch); return patch.recs.length > 0; });
    const patch = { recs: [{ id: "svg_a", version: 1, review: "needs-review" }] };
    try {
      await expect(applyEntry(entry("svgReview", ["svg_a"]), patch)).resolves.toBe(true);
      expect(seen).toEqual([patch]);
    } finally { unbind(); }
  });

  it("applies only the view keys the entry carries", async () => {
    patchView({ zoom: "full" });
    await expect(applyEntry(entry("view"), { filter: DEFAULT_SESSION.selection.filter })).resolves.toBe(true);
    expect(getAppState().view.zoom).toBe("full"); // untouched by a filter entry
    expect(getAppState().view.filter).toEqual(DEFAULT_SESSION.selection.filter);
  });

  it("re-selects a row and clears it again", async () => {
    await applyEntry(entry("view"), { selectedId: "pair_b" });
    expect(getAppState().view.selectedId).toBe("pair_b");
    await applyEntry(entry("view"), { selectedId: null });
    expect(getAppState().view.selectedId).toBeNull();
  });

  it("refuses a view value it recognises nothing in", async () => {
    await expect(applyEntry(entry("view"), { mystery: true })).resolves.toBe(false);
    await expect(applyEntry(entry("view"), "x")).resolves.toBe(false);
  });

  it("clamps restored prefs into the slider range", async () => {
    await expect(applyEntry(entry("prefs"), { mode: "compare", thumbHeight: 9999 })).resolves.toBe(true);
    expect(getAppState().prefs).toEqual({ mode: "compare", thumbHeight: 800 });
    await expect(applyEntry(entry("prefs"), [])).resolves.toBe(false);
  });

  it("restores sheets settings through the same validator as a restart", async () => {
    setAppState({ sheets: { padding: 0, size: 0, transparent: false } });
    await expect(applyEntry(entry("sheets"), { padding: 12, size: 1024, transparent: true })).resolves.toBe(true);
    expect(getAppState().sheets).toEqual({ padding: 12, size: 1024, transparent: true });
    await expect(applyEntry(entry("sheets"), null)).resolves.toBe(false);
  });

  it("refuses a kind it does not know instead of guessing", async () => {
    await expect(applyEntry(entry("deleteFiles"), { all: true })).resolves.toBe(false);
    expect(ENTRY_TYPES).toEqual(["decisions", "checked", "batchChecked", "svgChecked", "uploadChecked", "view", "prefs", "sheets", "svgReview", "uploadSettings"]);
  });
});
