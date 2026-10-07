// svgup_view.test.ts — the list controls of the SVG-to-upload tab (design §2).
// What the request asks for in the list: search, filters and a sort that never
// hides a problem, plus the counters the bulk bar shows. Pure, so the rules hold
// whether the list is 3 icons or 3 000.
import { describe, expect, it } from "vitest";
import { checkableIds, DEFAULT_UPLOAD_VIEW, toggleSelection, uploadCounts, visibleUploadRows } from "../src/lib/svgupload/view";
import type { UploadRow } from "../src/lib/svgupload/rows";

function row(over: Partial<UploadRow> = {}): UploadRow {
  return {
    id: "a", name: "icon-a_AI_1.png", dirPath: "run/split_01", exportBase: "icon-a_AI_1",
    svgPath: "run/split_01/icon-a_AI_1.svg", version: 1, versionLabel: "v1",
    fingerprint: "", metaPath: "run/split_01/icon-a_AI_1.svg.json",
    warnings: [], blocked: null, exportState: null, job: "queued", metaState: "none", ...over,
  };
}

describe("the seven counts the bar shows", () => {
  it("counts eligible, awaiting metadata, processing, processed, stale and failed apart", () => {
    const rows = [
      row({ id: "fresh", job: "queued", metaState: "accepted" }),
      row({ id: "waiting", job: "queued", metaState: "none" }),
      row({ id: "busy", job: "running", metaState: "accepted" }),
      row({ id: "done", job: "processed", metaState: "accepted", exportState: { status: "processed", at: "today", note: "" } }),
      row({ id: "old", job: "processed", metaState: "stale", exportState: { status: "stale", at: "yesterday", note: "" } }),
      row({ id: "broke", job: "failed", metaState: "accepted" }),
      row({ id: "stopped", blocked: "No usable SVG version — regenerate in Generate SVG" }),
    ];
    const counts = uploadCounts(rows);
    expect(counts.eligible).toBe(6); // the blocked row cannot be exported
    expect(counts.awaitingMeta).toBe(2); // "waiting" has none, "old" holds a STALE answer: both need a run
    expect(counts.processing).toBe(3); // two queued, one running
    expect(counts.processed).toBe(2);
    expect(counts.stale).toBe(1); // "old": a stale package with stale metadata
    expect(counts.failed).toBe(1);
    expect(counts.blocked).toBe(1);
  });
});

describe("visibleUploadRows", () => {
  it("searches the icon name and the folder, case-insensitively", () => {
    const rows = [row({ id: "a", name: "icon-trophy_AI_7.png" }), row({ id: "b", name: "icon-bunny_AI_2.png", dirPath: "run/split_02" })];
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, search: "TROPHY" }).map((r) => r.id)).toEqual(["a"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, search: "split_02" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters to the rows that still need something, never hiding the reason", () => {
    const rows = [
      row({ id: "ok" }),
      row({ id: "blocked", blocked: "No usable SVG version — regenerate in Generate SVG" }),
      row({ id: "warn", warnings: ["AI image missing"] }),
    ];
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, only: "ready" }).map((r) => r.id)).toEqual(["ok"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, only: "blocked" }).map((r) => r.id)).toEqual(["blocked"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, only: "warnings" }).map((r) => r.id)).toEqual(["warn"]);
  });

  it("sorts by path, name, version and state", () => {
    const rows = [
      row({ id: "b", name: "b.png", dirPath: "r/split_02", version: 3 }),
      row({ id: "a", name: "a.png", dirPath: "r/split_01", version: 2, blocked: "x" }),
    ];
    expect(visibleUploadRows(rows, DEFAULT_UPLOAD_VIEW).map((r) => r.id)).toEqual(["a", "b"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, sort: "name" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, sort: "version" }).map((r) => r.id)).toEqual(["b", "a"]);
    expect(visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, sort: "state" }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("is deterministic for equal keys — a rescan cannot reshuffle the list", () => {
    const rows = [row({ id: "z" }), row({ id: "y" })];
    const once = visibleUploadRows(rows, { ...DEFAULT_UPLOAD_VIEW, sort: "state" }).map((r) => r.id);
    const twice = visibleUploadRows([...rows].reverse(), { ...DEFAULT_UPLOAD_VIEW, sort: "state" }).map((r) => r.id);
    expect(once).toEqual(twice);
  });
});

describe("uploadCounts", () => {
  it("counts icons, ready, blocked and warned rows", () => {
    const rows = [row({ id: "ok" }), row({ id: "blocked", blocked: "x" }), row({ id: "warn", warnings: ["y"] })];
    const c = uploadCounts(rows);
    expect({ icons: c.icons, ready: c.ready, blocked: c.blocked, warned: c.warned }).toEqual({ icons: 3, ready: 1, blocked: 1, warned: 1 });
  });

  it("treats a blocked row's warning as the block, not as two problems", () => {
    const c = uploadCounts([row({ id: "b", blocked: "x", warnings: ["y"] })]);
    expect({ icons: c.icons, ready: c.ready, blocked: c.blocked, warned: c.warned }).toEqual({ icons: 1, ready: 0, blocked: 1, warned: 0 });
  });
});

describe("select all acts on what is VISIBLE (R19)", () => {
  const rows = [
    row({ id: "a" }),
    row({ id: "blocked", blocked: "No review-approved SVG version — approve one in Generate SVG" }),
    row({ id: "c" }),
  ];

  it("offers only the visible rows an action could use", () => {
    expect(checkableIds(rows)).toEqual(["a", "c"]);
  });

  it("adds the visible rows on, without dropping a hidden choice", () => {
    expect(toggleSelection(["hidden"], ["a", "c"], true)).toEqual(["hidden", "a", "c"]);
  });

  it("never duplicates a row that was already ticked", () => {
    expect(toggleSelection(["a"], ["a", "c"], true)).toEqual(["a", "c"]);
  });

  it("removes only the visible rows off, leaving hidden selections alone", () => {
    expect(toggleSelection(["hidden", "a", "c"], ["a", "c"], false)).toEqual(["hidden"]);
  });
});
