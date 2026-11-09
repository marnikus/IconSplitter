import { describe, expect, it } from "vitest";
import {
  dropItemsFromBatches, matchRejectedItems, parseRejectedFileNames,
} from "../src/lib/stockupload/rejectedfiles";
import type { StockUploadBatch } from "../src/lib/stockupload/batchhistory";
import type { ExportedItem } from "../src/lib/stockupload/types";

const ADOBE_ROWS = `<div role="presentation"><div role="row" data-key="0569-download-icon-22_01_v3.eps2026-11-09T14:46:16.000Z">
<div role="rowheader" aria-colindex="1"><span class="CC22fG_spectrum-Table-cellContents">0569-download-icon-22_01_v3.eps</span></div>
<div role="gridcell"><span class="CC22fG_spectrum-Table-cellContents"><span aria-label="November 9, 2026">11/9/2026, 3:46:16 PM</span></span></div>
<div role="gridcell"><span>SFTP</span></div><div role="gridcell"><span>Upload limit reached</span></div></div>
<div role="row"><div role="rowheader"><span>0102-icon-waving-flag_5_04.eps</span></div><div role="gridcell"><span>File size too small</span></div></div>
<div role="row"><div role="rowheader"><span>0568-Download-Icon-22_01_V3.eps</span></div></div></div>`;

function batch(id: string, stockId: string, files: Array<[string, string]>, failedCount = 0): StockUploadBatch {
  return {
    id, stockId, stockName: stockId, uploadedAt: "2026-11-09T15:00:00.000Z",
    uploadedCount: files.length, failedCount, cancelled: false, rootPath: "",
    files: files.map(([itemId, fileName]) => ({ itemId, fileName, format: "eps" as const, relPath: null, fullPath: null })),
  };
}

function item(id: string, fileName: string): ExportedItem {
  const ref = { relPath: `x/export/${fileName}`, fileName, bytes: 1, mtime: 0, ext: "eps" as const };
  return { id, stem: fileName.replace(/\.[^.]+$/, ""), exportDir: "x/export", recordPath: "x/export/r.json",
    record: {} as ExportedItem["record"], files: { raster: null, svg: null, eps: ref, zip: null }, missingRecorded: [] };
}

describe("parseRejectedFileNames", () => {
  it("reads only the file-name cells of a pasted stock-site table and strips the upload rank", () => {
    expect(parseRejectedFileNames(ADOBE_ROWS)).toEqual(["download-icon-22_01_v3.eps", "icon-waving-flag_5_04.eps"]);
  });

  it("accepts a comma or line separated list, keeps spaces inside names and ignores non-file words", () => {
    const text = "0001-star icon.eps, moon.jpg\n C:\\icons\\export\\sun.svg ; hello world,, moon.JPG";
    expect(parseRejectedFileNames(text)).toEqual(["star icon.eps", "moon.jpg", "sun.svg"]);
  });

  it("returns nothing for empty or file-less input", () => {
    expect(parseRejectedFileNames("")).toEqual([]);
    expect(parseRejectedFileNames("<div>Upload limit reached</div>")).toEqual([]);
  });
});

describe("matchRejectedItems", () => {
  const batches = [
    batch("b1", "adobe", [["i1", "download-icon-22_01_v3.eps"], ["i2", "download-icon-22_01_v3.eps"], ["i3", "keep.eps"]]),
    batch("b2", "shutter", [["i9", "icon-waving-flag_5_04.eps"]]),
  ];

  it("matches every item of the chosen stock carrying a pasted name, by stem across formats", () => {
    const names = ["download-icon-22_01_v3.jpg", "icon-waving-flag_5_04.eps", "missing.eps"];
    const res = matchRejectedItems(names, { stockId: "adobe", batches, items: [item("i7", "icon-waving-flag_5_04.eps")] });
    expect(res.itemIds.sort()).toEqual(["i1", "i2", "i7"]);
    expect(res.unmatchedNames).toEqual(["missing.eps"]);
    expect(res.matchedNames).toEqual(["download-icon-22_01_v3.jpg", "icon-waving-flag_5_04.eps"]);
  });

  it("ignores history of other stocks", () => {
    const res = matchRejectedItems(["icon-waving-flag_5_04.eps"], { stockId: "adobe", batches, items: [] });
    expect(res.itemIds).toEqual([]);
    expect(res.unmatchedNames).toEqual(["icon-waving-flag_5_04.eps"]);
  });
});

describe("dropItemsFromBatches", () => {
  it("moves the rejected items' files from uploaded to failed in that stock's runs only", () => {
    const batches = [
      batch("b1", "adobe", [["i1", "a.eps"], ["i1", "a.jpg"], ["i3", "keep.eps"]], 2),
      batch("b2", "shutter", [["i1", "a.eps"]]),
    ];
    const res = dropItemsFromBatches(batches, "adobe", new Set(["i1"]));
    expect(res.removedFiles).toBe(2);
    expect(res.batches[0]).toMatchObject({ uploadedCount: 1, failedCount: 4 });
    expect(res.batches[0].files.map((f) => f.fileName)).toEqual(["keep.eps"]);
    expect(res.batches[1]).toBe(batches[1]);
  });

  it("returns the same array when nothing matches", () => {
    const batches = [batch("b1", "adobe", [["i3", "keep.eps"]])];
    expect(dropItemsFromBatches(batches, "adobe", new Set(["nope"])).batches).toBe(batches);
  });
});
