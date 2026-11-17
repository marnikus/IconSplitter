import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_STATE, parseStockPresetState, serializeStockPresetState } from "../src/lib/stockupload/presets";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import type { ExportedItem } from "../src/lib/stockupload/types";

describe("per-stock upload options", () => {
  it("persists separate options and plans only the selected formats for each target", () => {
    const options = {
      "shutterstock": { formats: { raster: true, svg: false, eps: false, zip: false }, combineTitleDescription: true },
      "adobe-stock": { formats: { raster: false, svg: true, eps: false, zip: false }, combineTitleDescription: false },
    };
    const state = parseStockPresetState(serializeStockPresetState({ ...DEFAULT_STOCK_STATE, targetOptions: options }));
    expect(state.targetOptions).toEqual(options);
    const file = { relPath: "a.jpg", fileName: "a.jpg", bytes: 1, mtime: 0, ext: "jpg" };
    const item = { id: "a", stem: "a", files: { raster: file, svg: { ...file, fileName: "a.svg", ext: "svg" }, eps: null, zip: null }, record: { metadata: null } } as unknown as ExportedItem;
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["a"], presets: state.presets, checkedTargets: ["shutterstock", "adobe-stock"], formats: state.formats, targetOptions: state.targetOptions });
    expect(plan.tasks.map(t => [t.targetId, t.format])).toEqual([["shutterstock", "raster"], ["adobe-stock", "svg"]]);
    expect(plan.combineByTarget).toEqual({ "shutterstock": true, "adobe-stock": false });
  });
});
