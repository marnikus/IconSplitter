// @vitest-environment happy-dom
// upload_rename.test.ts — TDD unit & filesystem contract for upload file naming:
// human-readable Title + Description stems (no commas/dots, <= 180 chars sliced
// on whole-word boundaries), local pre-export store, export.json workName +
// uploadName fields, and atomic rename of existing export/ packages.
import { beforeEach, describe, expect, it } from "vitest";
import {
  UPLOAD_NAME_MAX_CHARS,
  buildUploadName,
  effectiveExportStem,
  sanitizeUploadName,
} from "../src/lib/upload/uploadname";
import { parseExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import {
  UPLOAD_NAMES_STORAGE_KEY,
  clearUploadNamesInMemory,
  getUploadName,
  setUploadName,
} from "../src/upload/uploadnamestore";
import { renameExportPackage } from "../src/upload/renameexport";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { writeSheetExport } from "../src/svgBuilder/sheetwriter";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#FFFFFF"/><path d="M20 20h100v100H20z" fill="#112233"/></svg>';

beforeEach(() => {
  localStorage.clear();
  clearUploadNamesInMemory();
});

describe("buildUploadName & sanitizeUploadName", () => {
  it("builds exact underscore-joined stem from Title + Description with zero commas or dots", () => {
    const out = buildUploadName({
      title: "Set of assorted cafe food icons",
      description: "Providing refreshing culinary enjoyment for customers. Drinks machine cup mug boba donut sandwich",
    });
    expect(out).toBe(
      "Set_of_assorted_cafe_food_icons_Providing_refreshing_culinary_enjoyment_for_customers_Drinks_machine_cup_mug_boba_donut_sandwich",
    );
    expect(out).not.toMatch(/[.,\s]/);
  });

  it("caps at 180 chars and always slices strictly on a complete word boundary without trailing underscore", () => {
    const out = buildUploadName({
      title: "Collection of modern geometric vector line icons for mobile banking financial dashboard",
      description: "Clean minimal outline symbols representing credit card payment wallet analytics security shield transfer currency exchange savings account invoice receipt calculator",
    });
    expect(out.length).toBeLessThanOrEqual(UPLOAD_NAME_MAX_CHARS);
    expect(out.endsWith("_")).toBe(false);
    // Every word in `out` must be a complete word from the input — never a truncated prefix.
    const inputWords = new Set(
      "Collection of modern geometric vector line icons for mobile banking financial dashboard Clean minimal outline symbols representing credit card payment wallet analytics security shield transfer currency exchange savings account invoice receipt calculator".split(" "),
    );
    for (const word of out.split("_")) {
      expect(inputWords.has(word)).toBe(true);
    }
  });

  it("sanitizes manual input, strips accidental file extensions, folds accents, and handles unbroken 200-char words", () => {
    expect(sanitizeUploadName("Café icons, set v1.0.svg")).toBe("Cafe_icons_set_v1_0");
    expect(sanitizeUploadName("   ... ,,,   ")).toBe("");
    const giant = "A".repeat(220);
    expect(sanitizeUploadName(giant)).toHaveLength(UPLOAD_NAME_MAX_CHARS);
    expect(effectiveExportStem("work_stem_v1", "")).toBe("work_stem_v1");
    expect(effectiveExportStem("work_stem_v1", "Custom name, here.")).toBe("Custom_name_here");
  });
});

describe("uploadnamestore & export.json workName + uploadName", () => {
  it("persists local per-file upload names before export and tolerates corrupt storage", () => {
    setUploadName("ab-1", "Set of cafe, icons.");
    expect(getUploadName("ab-1")).toBe("Set_of_cafe_icons");
    clearUploadNamesInMemory();
    expect(getUploadName("ab-1")).toBe("Set_of_cafe_icons");

    setUploadName("ab-1", "");
    expect(getUploadName("ab-1")).toBeNull();

    localStorage.setItem(UPLOAD_NAMES_STORAGE_KEY, "{not-valid-json");
    clearUploadNamesInMemory();
    expect(getUploadName("ab-1")).toBeNull();
  });

  it("exports under uploadName on first export while preserving workName & id in export.json, then renames existing export/ files atomically", async () => {
    const root = new FakeDir("workspace");
    const folder = "_artboard_sheets/2026-11/2026-11-19/icon-sheet_sheet_10_icons_yellow_blue_palette_id39045/artboard_01_cafe";
    const workName = "icon-sheet_sheet_10_icons_yellow_blue_palette_id39045_v1";
    const firstUpload = buildUploadName({
      title: "Set of assorted cafe food icons",
      description: "Providing refreshing culinary enjoyment for customers. Drinks machine cup mug boba donut sandwich",
    });

    const pkg = await buildSheetPackage({
      svg: SVG,
      metadata: {
        title: "Set of assorted cafe food icons",
        description: "Providing refreshing culinary enjoyment for customers. Drinks machine cup mug boba donut sandwich",
        tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "cafe", "food", "drink"],
        state: "accepted",
        validation: { ok: true, errors: [], warnings: [] },
        fingerprint: "fp1",
      },
      settings: { ...DEFAULT_UPLOAD_SETTINGS, includeSvg: true, includeJpeg: true, includeEps: false, expandText: false },
      folder,
      workName,
      stem: firstUpload,
      pairId: "ab-cafe-1",
      now: "2026-11-19T12:00:00.000Z",
      prompt: "p",
      model: "m",
    }, { pngBlob: async () => new Blob(["png-bytes"], { type: "image/png" }) });

    await writeSheetExport(root, folder, pkg.files);
    expect(pkg.record.pair.id).toBe("ab-cafe-1");
    expect(pkg.record.pair.base).toBe(workName);
    expect(pkg.record.workName).toBe(workName);
    expect(pkg.record.uploadName).toBe(firstUpload);
    expect(pkg.record.outputs.svg?.path).toBe(`${firstUpload}.svg`);

    // Stock discovery finds the renamed upload file and preserves workName + id:
    const found1 = await discoverExportedItems(root);
    expect(found1.items).toHaveLength(1);
    expect(found1.items[0].id).toBe("ab-cafe-1");
    expect(found1.items[0].workName).toBe(workName);
    expect(found1.items[0].stem).toBe(firstUpload);

    // Rename already-exported package on disk to a manual upload name:
    const renamed = await renameExportPackage({
      root,
      exportDir: `${folder}/export`,
      workName,
      nextUploadName: "Bakery and coffee icons collection",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.uploadName).toBe("Bakery_and_coffee_icons_collection");

    const found2 = await discoverExportedItems(root);
    expect(found2.audit.unrecordedFiles).toBe(found1.audit.unrecordedFiles);
    expect(found2.items[0].id).toBe("ab-cafe-1");
    expect(found2.items[0].workName).toBe(workName);
    expect(found2.items[0].stem).toBe("Bakery_and_coffee_icons_collection");
    expect(found2.items[0].files.svg?.fileName).toBe("Bakery_and_coffee_icons_collection.svg");

    // Verify raw export.json on disk still parses and carries both workName and uploadName:
    let node: FakeDir | undefined = root;
    for (const part of `${folder}/export`.split("/")) node = node?.children.get(part) as FakeDir | undefined;
    const diskRecord = parseExportRecord(JSON.parse((node!.children.get("export.json") as FakeFile).text));
    expect(diskRecord?.workName).toBe(workName);
    expect(diskRecord?.uploadName).toBe("Bakery_and_coffee_icons_collection");
    expect(node!.children.has("Bakery_and_coffee_icons_collection.png")).toBe(true);
    expect(node!.children.has(`${firstUpload}.png`)).toBe(false);
  });
});
