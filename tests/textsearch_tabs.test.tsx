// textsearch_tabs.test.tsx — ONE search for every list tab (2026-11-04), as it
// already worked in Generate SVG: type a file name, a folder or a status, in any
// case, several words narrow it down (each word must match somewhere). One
// matcher (lib/textsearch), one field (ui/SearchField); each tab only names the
// fields a row is searchable by — and every tab includes its status words.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchesSearch } from "../src/lib/textsearch";
import { applySvgFilters, ALL_SVG_FILTER, type SvgListRow } from "../src/lib/svglist";
import { applyUploadFilters } from "../src/upload/rowlist";
import { ALL_UPLOAD_FILTER, type UploadListRow } from "../src/upload/types";
import { ALL_STOCK_FILTER, filterAndSortItems } from "../src/stockupload/rowlist";
import { applyBatchFilters, ALL_BATCH_FILTER, type BatchRowLike } from "../src/lib/batchfilter";
import { ALL_FILTER, applyFilters, type ViewPair } from "../src/lib/reviewfilter";
import SearchField from "../src/ui/SearchField";
import FilterGrid from "../src/selectionv2/FilterGrid";
import BatchFilterGrid from "../src/batch/BatchFilterGrid";
import type { ExportedItem } from "../src/lib/stockupload/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the one matcher", () => {
  it("matches any field, ignores case, and needs every word somewhere", () => {
    const fields = ["Fog_AI.png", "architecture/split_01", "approved", null, undefined, 3, ["night", "cloud"]];
    expect(matchesSearch("", fields)).toBe(true);
    expect(matchesSearch("  ", fields)).toBe(true);
    expect(matchesSearch("FOG", fields)).toBe(true);
    expect(matchesSearch("split_01 approved", fields)).toBe(true);
    expect(matchesSearch("fog declined", fields)).toBe(false);
    expect(matchesSearch("cloud", fields)).toBe(true);
    expect(matchesSearch("3", fields)).toBe(true);
    expect(matchesSearch("not generated", ["not-generated"])).toBe(true); // hyphenated statuses read naturally
  });
});

/** Each tab, held to the same promise: name, folder and status all find the row. */
describe("every list tab searches by name, folder and status", () => {
  it("Generate SVG", () => {
    const row = { id: "a", name: "fog_AI.png", relPath: "arch/split_01/fog_AI.png", generation: "generated", review: "declined", version: 2 } as SvgListRow;
    const find = (search: string) => applySvgFilters([row], { ...ALL_SVG_FILTER, search }).length;
    expect([find("fog"), find("split_01"), find("declined"), find("v2"), find("approved")]).toEqual([1, 1, 1, 1, 0]);
  });

  it("SVG to upload — now also by package and metadata status", () => {
    const row: UploadListRow = { id: "a", name: "fog.svg", relPath: "arch/fog.svg", status: "partial", metadata: "accepted", approvedValid: 1, badges: [] };
    const find = (search: string) => applyUploadFilters([row], { ...ALL_UPLOAD_FILTER, search }).length;
    expect([find("fog"), find("arch"), find("partial"), find("accepted"), find("failed")]).toEqual([1, 1, 1, 1, 0]);
  });

  it("Upload (stock) — now also by metadata state and approval", () => {
    const item = {
      id: "a", stem: "fog", exportDir: "export/arch", recordPath: "export/arch/fog.json", files: {}, missingRecorded: [],
      record: { source: { approval: "approved" }, metadata: { state: "accepted", title: "Foggy hill", tags: ["mist"] } },
    } as unknown as ExportedItem;
    const find = (search: string) => filterAndSortItems({ items: [item], filter: { ...ALL_STOCK_FILTER, search }, sort: "name", rowBadges: { catalog: [], assigned: {} } as never, checked: [] }).length;
    expect([find("fog"), find("export/arch"), find("mist"), find("accepted"), find("approved"), find("invalid")]).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it("Batch folders — now also by status and review", () => {
    const row: BatchRowLike = { mtime: 1, status: "processed", review: "approved", name: "sheet.png", relPath: "set1/sheet.png", dirPath: "set1" };
    const find = (search: string) => applyBatchFilters([row], { ...ALL_BATCH_FILTER, search }).length;
    expect([find("sheet"), find("set1"), find("processed"), find("approved"), find("declined")]).toEqual([1, 1, 1, 1, 0]);
  });

  it("Selection V2 — now also by decision and either file's name", () => {
    const pair = {
      pairId: "p", base: "fog", suffix: "_7", relDir: "arch/split_01", created: 1, generated: 1, decision: "declined", reviewedAt: null,
      source: { relPath: "arch/split_01/fog.png", size: 1, mtime: 1, error: null },
      ai: { relPath: "arch/split_01/fog_AI_7.png", size: 1, mtime: 1, error: null },
    } as ViewPair;
    const find = (search: string) => applyFilters([pair], { ...ALL_FILTER, search }).length;
    expect([find("fog"), find("split_01"), find("declined"), find("fog_ai_7"), find("approved")]).toEqual([1, 1, 1, 1, 0]);
  });
});

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLInputElement | null;

async function type(sel: string, value: string): Promise<void> {
  const input = q(sel) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("one search field, in every tab", () => {
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  it("SearchField is a labelled search box that reports what is typed", async () => {
    const onChange = vi.fn();
    await act(async () => { ui.render(<SearchField testid="x-search" value="" onChange={onChange} placeholder="Name, folder or status…" />); });
    expect(q("[data-testid=x-search]")?.type).toBe("search");
    expect(q("[data-testid=x-search]")?.getAttribute("aria-label")).toBe("Search by name, folder or status");
    await type("[data-testid=x-search]", "fog");
    expect(onChange).toHaveBeenCalledWith("fog");
  });

  it("Selection V2 and Batch folders now have the field", async () => {
    const setFilter = vi.fn();
    await act(async () => {
      ui.render(<FilterGrid filter={ALL_FILTER} sort={{ by: "date", dir: "desc" }} shown={0} setFilter={setFilter} setSort={vi.fn()} />);
    });
    await type("[data-testid=v2-search]", "declined");
    expect(setFilter).toHaveBeenCalledWith({ ...ALL_FILTER, search: "declined" });
    const setBatch = vi.fn();
    await act(async () => {
      ui.render(<BatchFilterGrid filter={ALL_BATCH_FILTER} sort={{ by: "date", dir: "desc" } as never} shown={0} setFilter={setBatch} setSort={vi.fn()} />);
    });
    await type("[data-testid=batch-search]", "set1");
    expect(setBatch).toHaveBeenCalledWith(expect.objectContaining({ search: "set1" }));
  });

  it.each([
    "src/svg/SvgListFilters.tsx", "src/upload/UploadControls.tsx", "src/stockupload/StockUploadControls.tsx",
    "src/selectionv2/FilterGrid.tsx", "src/batch/BatchFilterGrid.tsx",
  ])("%s uses the shared field, not its own copy", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("<SearchField");
    expect(src).not.toContain('type="search"');
  });

  it.each([
    "src/lib/svglist.ts", "src/upload/rowlist.ts", "src/stockupload/rowlist.ts", "src/lib/batchfilter.ts", "src/lib/reviewfilter.ts",
  ])("%s matches through the shared matcher", (file) => {
    expect(readFileSync(file, "utf8")).toContain("matchesSearch(");
  });
});
