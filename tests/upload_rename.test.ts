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
import {
  beginRenameRun,
  cancelRenameRun,
  dismissRenameRun,
  renameBarCopy,
  renameSlotOf,
  resetAllRenameProgress,
} from "../src/upload/renameprogress";
import {
  clearRenameFeedback,
  getRenameFeedback,
  publishRenameFeedback,
} from "../src/upload/renamefeedback";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { writeSheetExport } from "../src/svgBuilder/sheetwriter";
import { artboardSheetJson, metaFileJson } from "../src/lib/svgBuilder/sheetsync";
import { newArtboard } from "../src/lib/svgBuilder/artboards";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { DEFAULT_SELECTION_RECIPE } from "../src/lib/svgBuilder/selection";
import { CONVERTERS } from "../src/lib/upload/epsconv/registry";
import { validateMetadata } from "../src/lib/upload/meta";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#FFFFFF"/><path d="M20 20h100v100H20z" fill="#112233"/></svg>';

beforeEach(() => {
  localStorage.clear();
  clearUploadNamesInMemory();
  resetAllRenameProgress();
  clearRenameFeedback();
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

  it("handles legacy exports with missing optional format files or PNG-only exports without throwing", async () => {
    const root = new FakeDir("workspace");
    const folder = "_artboard_sheets/2026-11/2026-11-19/icon-sheet_sheet_4_icons_ice_blue_palette_id91588/artboard_variant_1";
    const workName = "icon-sheet_sheet_4_icons_ice_blue_palette_id91588_v1";
    const pkg = await buildSheetPackage(
      {
        svg: SVG,
        metadata: null,
        settings: { ...DEFAULT_UPLOAD_SETTINGS, includeSvg: true, includeJpeg: true, includeEps: false, expandText: false },
        folder,
        stem: workName,
        pairId: "art-mwteva47-01hulw",
        now: "2026-11-19T12:00:00.000Z",
        prompt: "p",
        model: "gemini-2.5-flash",
      },
      { pngBlob: async () => new Blob(["png"], { type: "image/png" }) },
    );
    // Simulate a legacy export.json without uploadName/workName AND a stale eps slot whose file was removed:
    const legacyRec = JSON.parse(JSON.stringify(pkg.record));
    delete legacyRec.workName;
    delete legacyRec.uploadName;
    legacyRec.outputs.eps = { path: `${workName}.eps`, bytes: 10, hash: "sha256:00" };
    const files = pkg.files.map((f) => (
      f.name === "export.json" ? { name: "export.json", bytes: new TextEncoder().encode(JSON.stringify(legacyRec)) } : f
    ));
    await writeSheetExport(root, folder, files);

    const target = buildUploadName({
      title: "Breakfast meal and morning food icons",
      description: "Enjoying a peaceful morning breakfast ritual. Toaster pan egg pancake cup icons",
    });
    const res = await renameExportPackage({
      root,
      exportDir: `${folder}/export`,
      workName,
      nextUploadName: target,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.diskRenamed).toBe(true);
    expect(res.uploadName).toBe(target);
    expect(res.record?.outputs.eps).toBeNull();
  });

  it("automatically trims uploadName on a whole-word boundary when OS MAX_PATH limits filename length in deep folders", async () => {
    const root = new FakeDir("workspace");
    const folder = "_artboard_sheets/2026-11/2026-11-19/icon-sheet_sheet_4_icons_ice_blue_palette_id91588/artboard_variant_1";
    const workName = "icon-sheet_sheet_4_icons_ice_blue_palette_id91588_v1";
    const pkg = await buildSheetPackage(
      {
        svg: SVG,
        metadata: null,
        settings: { ...DEFAULT_UPLOAD_SETTINGS, includeSvg: true, includeJpeg: true, includeEps: false, expandText: false },
        folder,
        workName,
        stem: workName,
        pairId: "art-mwteva47-01hulw",
        now: "2026-11-19T12:00:00.000Z",
        prompt: "p",
        model: "gemini-2.5-flash",
      },
      { pngBlob: async () => new Blob(["png"], { type: "image/png" }) },
    );
    await writeSheetExport(root, folder, pkg.files);

    // Navigate to exportDir and enforce a 76-char filename limit (simulating Win32 259-char MAX_PATH in a 183-char folder):
    let exportDir: FakeDir | undefined = root;
    for (const part of `${folder}/export`.split("/")) exportDir = exportDir?.children.get(part) as FakeDir | undefined;
    const origGetFile = exportDir!.getFileHandle.bind(exportDir!);
    exportDir!.getFileHandle = async (name: string, opts?: { create?: boolean }) => {
      if (opts?.create && name.length > 76) throw new Error("NotFoundError: Path exceeds Win32 MAX_PATH");
      return origGetFile(name, opts);
    };

    const longDesired = buildUploadName({
      title: "Breakfast meal and morning food icons",
      description: "Enjoying a peaceful morning breakfast ritual. Toaster pan egg pancake cup icons",
    });
    expect(longDesired.length).toBe(116);

    const res = await renameExportPackage({
      root,
      exportDir: `${folder}/export`,
      workName,
      nextUploadName: longDesired,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.diskRenamed).toBe(true);
    expect(res.uploadName.length).toBeLessThanOrEqual(72);
    expect(res.uploadName.endsWith("_")).toBe(false);
    // Must end on a complete word from the source phrase:
    expect(longDesired.startsWith(`${res.uploadName}_`)).toBe(true);
    expect(exportDir!.children.has(`${res.uploadName}.svg`)).toBe(true);
    expect(exportDir!.children.has(`${res.uploadName}.png`)).toBe(true);
  });

  it("keeps uploadName strictly in JSON (export.json / sheet.json) and NEVER inside SVG, EPS, or metadata.json", async () => {
    const workName = "icon-sheet_01_v1";
    const uploadStem = "Unique_website_upload_filename_token_99";
    const title = "Breakfast meal and morning food icons";
    const description = "Enjoying a peaceful morning breakfast ritual with coffee and pancakes";
    const tags = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "breakfast", "morning", "food"];
    const validation = validateMetadata({ title, description, tags });

    const pkg = await buildSheetPackage(
      {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><path d="M10 10h80v80H10z" fill="none" stroke="#111111" stroke-width="2"/></svg>',
        metadata: { state: "accepted", title, description, tags, validation, fingerprint: "fp1" },
        settings: { ...DEFAULT_UPLOAD_SETTINGS, includeSvg: true, includeJpeg: false, includeEps: true, expandText: false },
        folder: "_artboard_sheets/2026-11/2026-11-19/tpl/art_01",
        workName,
        stem: uploadStem,
        pairId: "art-json-only",
        now: "2026-11-19T12:00:00.000Z",
        prompt: "p",
        model: "gemini-2.5-flash",
      },
      { eps: (inp) => CONVERTERS.builtin.convert(inp, { bridgeUrl: "", fetch: globalThis.fetch }) },
    );

    const dec = new TextDecoder();
    const svgFile = pkg.files.find((f) => f.name === `${uploadStem}.svg`)!;
    const epsFile = pkg.files.find((f) => f.name === `${uploadStem}.eps`)!;
    const jsonFile = pkg.files.find((f) => f.name === "export.json")!;
    expect(pkg.problems).toEqual([]);
    expect(svgFile).toBeDefined();
    expect(epsFile).toBeDefined();

    // SVG & EPS file contents carry Title/Description/Tags, NEVER uploadName:
    expect(dec.decode(svgFile.bytes)).not.toContain(uploadStem);
    expect(dec.decode(epsFile.bytes)).not.toContain(uploadStem);

    // export.json carries workName & uploadName at top level, NEVER inside record.metadata:
    const parsedJson = JSON.parse(dec.decode(jsonFile.bytes));
    expect(parsedJson.workName).toBe(workName);
    expect(parsedJson.uploadName).toBe(uploadStem);
    expect(JSON.stringify(parsedJson.metadata)).not.toContain(uploadStem);

    // sheet.json stores uploadName, while metadata.json NEVER stores uploadName:
    const tpl = newTemplate(DEFAULT_CONFIG, [], "2026-11-19T00:00:00Z", "tpl-1");
    const ab = {
      ...newArtboard(tpl, [], { id: "art-json-only", now: "2026-11-19T00:00:00Z", placedIds: [] }),
      uploadName: uploadStem,
    };
    const sheetJson = artboardSheetJson(ab, tpl, { assets: [], seed: 1, recipe: DEFAULT_SELECTION_RECIPE });
    expect(sheetJson.uploadName).toBe(uploadStem);
    const metaJson = metaFileJson(JSON.stringify({ uploadName: uploadStem }), ab.metadata);
    expect("uploadName" in metaJson).toBe(false);
    expect(JSON.stringify(metaJson)).not.toContain(uploadStem);
  });

  it("detects alreadyNamed without rewriting export.json when exported files already match target uploadName", async () => {
    const root = new FakeDir("workspace");
    const folder = "_artboard_sheets/2026-11/2026-11-19/tpl/art_same";
    const workName = "art_same_v1";
    const uploadStem = "Cafe_food_icons_collection";
    const fixedTime = "2026-11-19T10:00:00.000Z";
    const pkg = await buildSheetPackage(
      {
        svg: SVG,
        metadata: null,
        settings: { ...DEFAULT_UPLOAD_SETTINGS, includeSvg: true, includeJpeg: false, includeEps: false, expandText: false },
        folder,
        workName,
        stem: uploadStem,
        pairId: "art-same-1",
        now: fixedTime,
        prompt: "p",
        model: "m",
      },
      { pngBlob: async () => new Blob(["png"], { type: "image/png" }) },
    );
    await writeSheetExport(root, folder, pkg.files);

    const again = await renameExportPackage({
      root,
      exportDir: `${folder}/export`,
      workName,
      nextUploadName: uploadStem,
      now: "2026-11-19T23:59:59.000Z",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.diskRenamed).toBe(false);
    expect(again.alreadyNamed).toBe(true);
    expect(again.uploadName).toBe(uploadStem);
    expect(again.record?.timestamps.committedAt).toBe(fixedTime);
  });
});

describe("renameprogress & renamefeedback contracts", () => {
  it("tracks live done/total/left/percent, cancellation, and persistent result summary across sources", () => {
    const slot = renameSlotOf("upload");
    const run = beginRenameRun("upload", 4);
    expect(slot.value?.status).toBe("running");
    expect(renameBarCopy(slot.value!).totals).toEqual({ done: 0, total: 4, left: 4, percent: 0 });

    run.startItem("coffee_AI.svg");
    run.record({ kind: "disk" });
    run.startItem("donut_AI.svg");
    run.record({ kind: "unchanged" });
    run.startItem("mug_AI.svg");
    run.record({ kind: "skipped" });
    run.startItem("boba_AI.svg");
    run.record({ kind: "pending" });

    const summary = run.finish();
    expect(summary.err).toBe(false);
    expect(slot.value?.status).toBe("completed");
    const finishedCopy = renameBarCopy(slot.value!);
    expect(finishedCopy.totals).toEqual({ done: 4, total: 4, left: 0, percent: 100 });
    expect(finishedCopy.detail).toContain("2 renamed");
    expect(finishedCopy.detail).toContain("1 already had same name");
    expect(finishedCopy.detail).toContain("1 skipped");

    // Stays visible until explicitly dismissed:
    dismissRenameRun("upload");
    expect(slot.value).toBeNull();

    // Supports mid-batch cancellation:
    const run2 = beginRenameRun("svgBuilder", 3);
    run2.startItem("artboard_1");
    run2.record({ kind: "disk" });
    cancelRenameRun("svgBuilder");
    expect(run2.isCancelled()).toBe(true);
    const cancelledSummary = run2.finish();
    expect(cancelledSummary.err).toBe(false);
    expect(renameSlotOf("svgBuilder").value?.status).toBe("cancelled");
  });

  it("increments per-item feedback sequence on repeated identical single-item responses", () => {
    publishRenameFeedback("row-1", "Upload file name is already Foo (no changes needed)");
    const first = getRenameFeedback("row-1");
    expect(first?.seq).toBe(1);
    publishRenameFeedback("row-1", "Upload file name is already Foo (no changes needed)");
    const second = getRenameFeedback("row-1");
    expect(second?.seq).toBe(2);
    expect(second?.msg).toContain("already Foo");
  });
});
