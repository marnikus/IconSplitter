// svgup_view.test.ts — the list controls of the SVG-to-upload tab (design §2).
// What the request asks for in the list: search, filters and a sort that never
// hides a problem, plus the counters the bulk bar shows. Pure, so the rules hold
// whether the list is 3 icons or 3 000.
import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_VIEW, uploadCounts, visibleUploadRows } from "../src/lib/svgupload/view";
import type { UploadRow } from "../src/lib/svgupload/rows";

function row(over: Partial<UploadRow> = {}): UploadRow {
  return {
    id: "a", name: "icon-a_AI_1.png", dirPath: "run/split_01", exportBase: "icon-a_AI_1",
    svgPath: "run/split_01/icon-a_AI_1.svg", version: 1, versionLabel: "v1",
    fingerprint: "", metaPath: "run/split_01/icon-a_AI_1.svg.json",
    warnings: [], blocked: null, exportState: null, ...over,
  };
}

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
    expect(uploadCounts(rows)).toEqual({ icons: 3, ready: 1, blocked: 1, warned: 1 });
  });

  it("treats a blocked row's warning as the block, not as two problems", () => {
    expect(uploadCounts([row({ id: "b", blocked: "x", warnings: ["y"] })])).toEqual({ icons: 1, ready: 0, blocked: 1, warned: 0 });
  });
});
