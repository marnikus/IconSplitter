import { beforeEach, describe, expect, it } from "vitest";
import {
  appendStockUploadBatch, batchesForStock, loadStockUploadBatches, resetStockUploadBatches,
  STOCK_UPLOAD_BATCH_HISTORY_KEY,
} from "../src/stockupload/batchhistorystore";
import { fullStockFilePath, parseStockUploadBatch } from "../src/lib/stockupload/batchhistory";

const batch = (id: string, stockId = "shutterstock") => ({
  id, stockId, stockName: "Shutterstock", uploadedAt: "2026-11-08T10:00:00.000Z",
  uploadedCount: 1, failedCount: 1, cancelled: false,
  rootPath: "F:\\Stocks 2026\\icons testing",
  files: [{ itemId: "icon-1", fileName: "star.svg", format: "svg" as const,
    relPath: "icons_a/export/star.svg", fullPath: "F:\\Stocks 2026\\icons testing\\icons_a\\export\\star.svg" }],
});

beforeEach(() => {
  localStorage.clear();
  resetStockUploadBatches();
});

describe("per-stock upload batch history", () => {
  it("appends independent stock batches, returns newest first, and persists validated records", () => {
    appendStockUploadBatch(batch("one"));
    appendStockUploadBatch({ ...batch("two", "adobe-stock"), stockId: "adobe-stock", stockName: "Adobe Stock" });
    appendStockUploadBatch(batch("three"));

    expect(batchesForStock("shutterstock").map((entry) => entry.id)).toEqual(["three", "one"]);
    expect(batchesForStock("adobe-stock").map((entry) => entry.id)).toEqual(["two"]);
    expect(loadStockUploadBatches()).toHaveLength(3);
    expect(localStorage.getItem(STOCK_UPLOAD_BATCH_HISTORY_KEY)).toContain("star.svg");
  });

  it("rejects malformed stored rows and caps the append-only history", () => {
    const raw = { v: 1, batches: [batch("good"), { ...batch("bad"), uploadedCount: -1 }] };
    localStorage.setItem(STOCK_UPLOAD_BATCH_HISTORY_KEY, JSON.stringify(raw));
    expect(loadStockUploadBatches().map((entry) => entry.id)).toEqual(["good"]);
    for (let i = 0; i < 230; i++) appendStockUploadBatch(batch(`id-${i}`));
    expect(loadStockUploadBatches()).toHaveLength(200);
    expect(loadStockUploadBatches().at(-1)?.id).toBe("id-229");
  });

  it("builds full paths only from a valid captured folder and a safe relative file path", () => {
    expect(fullStockFilePath("F:\\Stocks 2026", "icons/export/asset 1.svg"))
      .toBe("F:\\Stocks 2026\\icons\\export\\asset 1.svg");
    expect(fullStockFilePath("", "icons/export/asset.svg")).toBeNull();
    expect(fullStockFilePath("F:\\Stocks 2026", "../outside.svg")).toBeNull();
    expect(fullStockFilePath("not a drive path", "icons/asset.svg")).toBeNull();
  });

  it("validates a batch record without accepting count/file mismatches or unsafe paths", () => {
    expect(parseStockUploadBatch(batch("valid"))?.files).toHaveLength(1);
    expect(parseStockUploadBatch({ ...batch("bad-count"), uploadedCount: 2 })).toBeNull();
    expect(parseStockUploadBatch({ ...batch("bad-file"), files: [{
      ...batch("bad-file").files[0], relPath: "../../secret.svg",
    }] })).toBeNull();
  });

  it("persists an optional note while remaining compatible with older history rows", () => {
    const noted = parseStockUploadBatch({ ...batch("noted"), note: "Autumn catalog refresh" });
    expect(noted).toMatchObject({ id: "noted", note: "Autumn catalog refresh" });
    expect(parseStockUploadBatch(batch("legacy"))).toMatchObject({ id: "legacy" });
    expect(parseStockUploadBatch({ ...batch("bad-note"), note: 42 })).toBeNull();
    expect(parseStockUploadBatch({ ...batch("long-note"), note: "x".repeat(2001) })).toBeNull();
  });
});
