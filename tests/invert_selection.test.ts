// invert_selection.test.ts — "⇄ Invert" in every list tab (2026-11-06): every
// VISIBLE row flips (checked ↔ unchecked); checks hidden by filters stay as
// they are, the same scope rule as the header checkbox. One pure rule, one
// button component, and each tab records it as one undoable selection step.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invertChecked } from "../src/lib/reviewselect";

describe("invertChecked", () => {
  it("flips the visible rows and keeps hidden checks", () => {
    expect(invertChecked(["a", "hidden"], ["a", "b", "c"])).toEqual(["hidden", "b", "c"]);
  });
  it("nothing checked → all visible; all visible checked → none of them", () => {
    expect(invertChecked([], ["a", "b"])).toEqual(["a", "b"]);
    expect(invertChecked(["a", "b"], ["a", "b"])).toEqual([]);
  });
  it("twice is the original set (as a set)", () => {
    const once = invertChecked(["b", "x"], ["a", "b", "c"]);
    expect(new Set(invertChecked(once, ["a", "b", "c"]))).toEqual(new Set(["b", "x"]));
  });
  it("keeps the visible order for the newly checked rows", () => {
    expect(invertChecked(["b"], ["c", "b", "a"])).toEqual(["c", "a"]);
  });
});

describe("wired into every list tab", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it.each([
    ["src/batch/BatchBulkBar.tsx", "batch"],
    ["src/selectionv2/BulkBar.tsx", "v2"],
    ["src/svg/SvgBulkBar.tsx", "svg"],
    ["src/upload/UploadBulkBar.tsx", "upload"],
    ["src/stockupload/StockUploadBulkBar.tsx", "stock"],
  ])("%s has the Invert button", (file, prefix) => {
    expect(src(file)).toContain("<InvertButton");
    expect(src(file)).toContain(`prefix="${prefix}"`);
  });
  it.each([
    "src/batch/useBatchSelection.ts", "src/selectionv2/useSelectionV2.ts", "src/svg/actions.ts",
    "src/upload/uiactions.ts", "src/stockupload/selectionactions.ts",
  ])("%s inverts through invertChecked", (file) => { expect(src(file)).toContain("invertChecked("); });
});
