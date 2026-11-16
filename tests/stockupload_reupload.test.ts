import { describe, expect, it } from "vitest";
import { applySubmittedUploadPolicy, buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { ADOBE_STOCK_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import type { ExportedItem } from "../src/lib/stockupload/types";

const raster = { relPath: "export/icon.jpg", fileName: "icon.jpg", bytes: 20, mtime: 1, ext: "jpg" as const };
function item(id: string): ExportedItem {
  return {
    id, stem: id, exportDir: "export", recordPath: "export/export.json",
    record: { metadata: null }, files: { raster, svg: null, eps: null, zip: null }, missingRecorded: [],
  } as unknown as ExportedItem;
}

function plan() {
  const items = [item("sent-shutterstock"), item("sent-adobe"), item("new")];
  return buildStockUploadPlan({
    items, checkedIds: items.map((entry) => entry.id),
    presets: [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET],
    checkedTargets: ["shutterstock", "adobe-stock"],
    formats: { raster: true, svg: false, eps: false, zip: false },
    submittedBadgeIdsByItem: {
      "sent-shutterstock": ["shutterstock"],
      "sent-adobe": ["adobe-stock"],
    },
  });
}

const taskRows = (value: ReturnType<typeof plan>) => value.tasks.map(({ targetId, itemId }) => `${targetId}:${itemId}`);

describe("per-stock re-upload selection", () => {
  it("skips stock-badged icons by default but always includes unbadged icons", () => {
    const base = plan();
    expect(base.submittedItemIdsByTarget).toEqual({
      shutterstock: ["sent-shutterstock"], "adobe-stock": ["sent-adobe"],
    });
    expect(taskRows(applySubmittedUploadPolicy(base, []))).toEqual([
      "shutterstock:sent-adobe", "shutterstock:new", "adobe-stock:sent-shutterstock", "adobe-stock:new",
    ]);
  });

  it("re-uploads only the previously submitted icons for checked sites", () => {
    const base = plan();
    expect(taskRows(applySubmittedUploadPolicy(base, ["shutterstock"]))).toEqual([
      "shutterstock:sent-shutterstock", "shutterstock:sent-adobe", "shutterstock:new",
      "adobe-stock:sent-shutterstock", "adobe-stock:new",
    ]);
    expect(taskRows(applySubmittedUploadPolicy(base, ["shutterstock", "adobe-stock"]))).toHaveLength(6);
  });
});
