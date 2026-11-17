// getdata_wired.test.ts — "Get data" is in every tab that has rows to select
// (2026-11-10): the button sits in the tab's bar, reads only that tab's selected
// rows through that tab's mapper, and is off with nothing selected.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(p, "utf8");

describe("every tab with selectable rows has the button", () => {
  it.each([
    ["Batch folders", "src/batch/BatchBulkBar.tsx", 'testid="batch"', "src/batch/BatchPanel.tsx", "batchDataRows("],
    ["Selection V2", "src/selectionv2/BulkBar.tsx", 'testid="v2"', "src/selectionv2/SelectionV2Panel.tsx", "pairDataRows("],
    ["Generate SVG", "src/svg/SvgBulkBar.tsx", 'testid="svg"', "src/svg/SvgPanel.tsx", "svgDataRows("],
    ["SVG to upload", "src/upload/UploadBulkBar.tsx", 'testid="upload"', "src/upload/UploadPanel.tsx", "uploadDataRows("],
    ["Upload (stock)", "src/stockupload/StockUploadBulkBar.tsx", 'testid="stock"', "src/stockupload/StockUploadBulkBar.tsx", "stockDataRows("],
    ["Single sheets", "src/sheets/SheetsList.tsx", 'testid="sheet"', "src/sheets/SheetsList.tsx", "sheetDataRows("],
    ["SVG builder", "src/svgBuilder/SvgBuilderLibrary.tsx", 'testid="builder"', "src/svgBuilder/SvgBuilderLibrary.tsx", "builderDataRows("],
  ])("%s", (_tab, barFile, id, mapperFile, mapper) => {
    const bar = src(barFile);
    expect(bar).toContain("<GetDataButton");
    expect(bar).toContain(id);
    expect(src(mapperFile)).toContain(mapper);
  });
});
