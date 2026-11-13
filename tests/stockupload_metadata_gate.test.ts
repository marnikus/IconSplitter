// The Upload tab never sends a row with empty metadata (2026-11-12): a row with
// no title, no description or no keywords is left out of the run and said so in
// the confirmation, instead of reaching Getty as a card that never validates.
import { describe, expect, it } from "vitest";
import {
  NO_METADATA_ERROR, hasUploadMetadata, splitByMetadata, withSkippedNoMetadata,
} from "../src/lib/stockupload/metadatagate";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import type { ExportedItem } from "../src/lib/stockupload/types";

const raster = { relPath: "export/icon.jpg", fileName: "icon.jpg", bytes: 20, mtime: 1, ext: "jpg" as const };
const META = { title: "Star icon", description: "A five-point star.", tags: ["star", "shape"] };
function item(id: string, metadata: Partial<typeof META> | null): ExportedItem {
  return {
    id, stem: id, exportDir: "export", recordPath: "export/export.json",
    record: { metadata: metadata === null ? null : { state: "accepted", ...META, ...metadata } },
    files: { raster, svg: null, eps: null, zip: null }, missingRecorded: [],
  } as unknown as ExportedItem;
}

describe("which rows may be uploaded", () => {
  it("needs a title, a description and at least one keyword", () => {
    expect(hasUploadMetadata(item("ok", {}))).toBe(true);
    expect(hasUploadMetadata(item("none", null))).toBe(false);
    expect(hasUploadMetadata(item("no-title", { title: "  " }))).toBe(false);
    expect(hasUploadMetadata(item("no-desc", { description: "" }))).toBe(false);
    expect(hasUploadMetadata(item("no-tags", { tags: [" ", ""] }))).toBe(false);
  });

  it("needs it accepted: text saved without its Icon Name is not in the files (2026-11-13)", () => {
    expect(hasUploadMetadata(item("draft", { state: "invalid" } as never))).toBe(false);
  });

  it("splits the checked rows: the blank ones are named, the rest go on", () => {
    const items = [item("a", {}), item("b", null), item("c", { description: "" }), item("d", {})];
    const split = splitByMetadata(items, ["a", "b", "c"]);
    expect(split.uploadable).toEqual(["a"]);
    expect(split.skipped).toEqual([{ itemId: "b", stem: "b" }, { itemId: "c", stem: "c" }]);
  });
});

describe("the plan the Upload tab confirms", () => {
  const planOf = (items: ExportedItem[], checked: string[]) => {
    const split = splitByMetadata(items, checked);
    const plan = buildStockUploadPlan({
      items, checkedIds: split.uploadable, presets: [SHUTTERSTOCK_PRESET], checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: false, eps: false, zip: false },
    });
    return withSkippedNoMetadata(plan, split.skipped);
  };

  it("uploads only the rows with metadata and lists the skipped ones", () => {
    const plan = planOf([item("a", {}), item("b", null)], ["a", "b"]);
    expect(plan.tasks.map((task) => task.itemId)).toEqual(["a"]);
    expect(plan.skippedNoMetadata).toEqual([{ itemId: "b", stem: "b" }]);
    expect(plan.preflightErrors).toEqual([]);
  });

  it("refuses to start when every checked row is blank, and says why", () => {
    const plan = planOf([item("b", null)], ["b"]);
    expect(plan.preflightErrors).toEqual([NO_METADATA_ERROR]);
  });
});
