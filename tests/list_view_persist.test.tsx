// list_view_persist.test.tsx — Generate SVG, SVG to upload and Upload remember
// their list view across a reload (2026-11-06): every filter (one value or
// several), the search text, the sort and Generate SVG's direction arrow. Batch
// and Selection V2 already did. Stored values are validated on read (RULE 13):
// anything unknown falls back to the default.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_SVG_FILTER } from "../src/lib/svglist";
import { LIST_VIEW_KEYS, loadListView, useSaveListView } from "../src/state/listviewstore";
import { loadSvgListView } from "../src/svg/listview";
import { loadUploadListView } from "../src/upload/listview";
import { loadStockListView } from "../src/stockupload/listview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => { for (const k of Object.values(LIST_VIEW_KEYS)) localStorage.removeItem(k); });
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

describe("Generate SVG", () => {
  it("restores filters (several values), search, sort and direction", () => {
    put(LIST_VIEW_KEYS.svg, { filter: { generation: ["generating", "generated"], review: "pending", search: "fog" }, sort: "name", sortDir: "desc" });
    expect(loadSvgListView()).toEqual({ filter: { generation: ["generating", "generated"], review: "pending", search: "fog" }, sort: "name", sortDir: "desc" });
  });
  it("falls back to the defaults for anything unknown or a damaged entry", () => {
    put(LIST_VIEW_KEYS.svg, { filter: { generation: "bogus", review: ["nope"], search: 4 }, sort: "sideways", sortDir: "up" });
    expect(loadSvgListView()).toEqual({ filter: ALL_SVG_FILTER, sort: "date", sortDir: "desc" });
    localStorage.setItem(LIST_VIEW_KEYS.svg, "{broken");
    expect(loadSvgListView().filter).toEqual(ALL_SVG_FILTER);
  });
});

describe("SVG to upload and Upload", () => {
  it("SVG to upload restores package, metadata, badges, search and sort", () => {
    put(LIST_VIEW_KEYS.upload, { filter: { status: ["processed", "stale"], metadata: "accepted", badge: ["none", "rb1"], search: "x" }, sort: "status" });
    expect(loadUploadListView()).toEqual({ filter: { status: ["processed", "stale"], metadata: "accepted", badge: ["none", "rb1"], search: "x" }, sort: "status" });
    put(LIST_VIEW_KEYS.upload, { filter: { status: "weird", badge: [3] }, sort: "nope" });
    expect(loadUploadListView()).toEqual({ filter: { status: "all", metadata: "all", badge: "all", search: "" }, sort: "name" });
  });
  it("Upload restores format, badges, search and sort", () => {
    put(LIST_VIEW_KEYS.stock, { filter: { format: ["svg", "eps"], badge: "adobe-stock", search: "cat" }, sort: "name" });
    expect(loadStockListView()).toEqual({ filter: { format: ["svg", "eps"], badge: "adobe-stock", search: "cat" }, sort: "name" });
    expect(loadListView("no-such-key", () => 7)).toBe(7);
  });
});

describe("saving", () => {
  it("writes the view whenever it changes", async () => {
    const host = document.createElement("div");
    const ui = createRoot(host);
    function Probe({ v }: { v: object }) { useSaveListView(LIST_VIEW_KEYS.stock, v); return null; }
    await act(async () => { ui.render(<Probe v={{ sort: "name" }} />); });
    expect(JSON.parse(localStorage.getItem(LIST_VIEW_KEYS.stock) ?? "{}")).toEqual({ sort: "name" });
    await act(async () => { ui.render(<Probe v={{ sort: "path" }} />); });
    expect(JSON.parse(localStorage.getItem(LIST_VIEW_KEYS.stock) ?? "{}")).toEqual({ sort: "path" });
    act(() => ui.unmount());
  });

  it("each tab starts from the saved view and saves it", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    expect(src("src/svg/statemodel.ts")).toContain("loadSvgListView()");
    expect(src("src/upload/statemodel.ts")).toContain("loadUploadListView()");
    expect(src("src/stockupload/model.ts")).toContain("loadStockListView()");
    for (const f of ["src/svg/statemodel.ts", "src/upload/statemodel.ts", "src/stockupload/useStockUpload.ts"]) expect(src(f)).toContain("useSaveListView(");
  });
});
