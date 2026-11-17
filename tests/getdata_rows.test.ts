// getdata_rows.test.ts — what each tab hands to "Get data" (2026-11-10): for its
// selected rows only, in list order, the SVG file, the PNG file, the status
// (generation, review …) and the path, from its own row model.
import { describe, expect, it } from "vitest";
import { batchDataRows } from "../src/batch/getdatarows";
import { builderDataRows } from "../src/svgBuilder/getdatarows";
import { pairDataRows } from "../src/selectionv2/getdatarows";
import { sheetDataRows } from "../src/sheets/getdatarows";
import { stockDataRows } from "../src/stockupload/getdatarows";
import { svgDataRows } from "../src/svg/getdatarows";
import { uploadDataRows } from "../src/upload/getdatarows";

const as = <T,>(v: unknown) => v as T;

describe("Batch folders", () => {
  const rows = [
    { name: "fish_AI.png", relPath: "Sea/fish_AI.png", status: "processed", review: "approved", selected: true },
    { name: "owl_AI.png", relPath: "Sky/owl_AI.png", status: "unprocessed", review: "pending", selected: false },
    { name: "cat_AI.png", relPath: "cat_AI.png", status: "skipped", review: "warning", selected: true },
  ];
  it("takes the selected rows: the PNG, its path, its split status and review", () => {
    expect(batchDataRows(as(rows))).toEqual([
      { svg: null, png: { name: "fish_AI.png", path: "Sea/fish_AI.png" }, status: ["processed", "approved"] },
      { svg: null, png: { name: "cat_AI.png", path: "cat_AI.png" }, status: ["skipped", "warning"] },
    ]);
  });
});

describe("Selection V2", () => {
  const pair = (id: string, ai: string | null, decision: string) => ({
    pairId: id, base: "b", suffix: "", relDir: "Sea", decision,
    source: { relPath: `Sea/${id}.png` }, ai: ai === null ? null : { relPath: ai },
  });
  const pairs = [pair("fish", "Sea/fish_AI.png", "approved"), pair("owl", null, "pending"), pair("cat", "Sky/cat_AI.png", "declined")];
  it("takes the checked pairs: the AI image (else the original), its path, the decision", () => {
    expect(pairDataRows(as(pairs), ["cat", "owl"])).toEqual([
      { svg: null, png: { name: "owl.png", path: "Sea/owl.png" }, status: ["pending"] },
      { svg: null, png: { name: "cat_AI.png", path: "Sky/cat_AI.png" }, status: ["declined"] },
    ]);
  });
});

describe("Generate SVG", () => {
  const row = (id: string, status: string, review: string, svgPath: string | null) => ({
    source: { id, name: `${id}_AI.png`, relPath: `Sea/${id}_AI.png` },
    status, review, running: false, queued: false,
    meta: { preferred: null, versions: svgPath === null ? [] : [{ version: 2, svgPath, status: "generated", validation: { ok: true } }] },
  });
  const rows = [row("fish", "generated", "approved", "Sea/fish_AI_v2.svg"), row("owl", "not-generated", "pending", null), row("cat", "failed", "pending", null)];
  it("takes the checked rows: both files when generated, the generation status and the review", () => {
    expect(svgDataRows(as(rows), ["fish", "owl"])).toEqual([
      { svg: { name: "fish_AI_v2.svg", path: "Sea/fish_AI_v2.svg" }, png: { name: "fish_AI.png", path: "Sea/fish_AI.png" }, status: ["Generated", "Approved"] },
      { svg: null, png: { name: "owl_AI.png", path: "Sea/owl_AI.png" }, status: ["Not generated", "Pending"] },
    ]);
  });
  it("names a failure and a running row", () => {
    expect(svgDataRows(as(rows), ["cat"])[0].status).toEqual(["Failed", "Pending"]);
    expect(svgDataRows(as([{ ...rows[1], status: "generating" }]), ["owl"])[0].status[0]).toBe("Generating");
  });
});

describe("SVG to upload", () => {
  const row = (id: string, status: string, meta: string) => ({
    source: { id, svgName: `${id}.svg`, svgPath: `Sea/${id}.svg`, aiPath: `Sea/${id}_AI.png` }, status, meta: { state: meta },
  });
  it("takes the checked rows: the SVG, the AI PNG, the export status and the metadata state", () => {
    expect(uploadDataRows(as([row("fish", "processed", "accepted"), row("owl", "failed", "empty")]), ["owl"])).toEqual([
      { svg: { name: "owl.svg", path: "Sea/owl.svg" }, png: { name: "owl_AI.png", path: "Sea/owl_AI.png" }, status: ["failed", "metadata empty"] },
    ]);
  });
  it("no AI path, no PNG", () => {
    const r = row("x", "processed", "accepted");
    r.source.aiPath = "";
    expect(uploadDataRows(as([r]), ["x"])[0].png).toBeNull();
  });
});

describe("Upload (stock)", () => {
  const item = (id: string, files: unknown) => ({ id, stem: id, files });
  const files = (stem: string) => ({
    raster: { relPath: `export/${stem}.png`, fileName: `${stem}.png`, ext: "png" },
    svg: { relPath: `export/${stem}.svg`, fileName: `${stem}.svg`, ext: "svg" },
    eps: null, zip: null,
  });
  const names = new Map([["p-adobe", "Adobe Stock"], ["shutter", "Shutterstock"]]);
  const history = { fish: { "p-adobe": { status: "uploaded" }, shutter: { status: "failed" } } };
  it("takes the checked items: the exported SVG and PNG, and what each stock says", () => {
    const items = [item("fish", files("fish")), item("owl", files("owl"))];
    expect(stockDataRows(as(items), ["fish", "owl"], as(history), names)).toEqual([
      { svg: { name: "fish.svg", path: "export/fish.svg" }, png: { name: "fish.png", path: "export/fish.png" }, status: ["Adobe Stock: uploaded", "Shutterstock: failed"] },
      { svg: { name: "owl.svg", path: "export/owl.svg" }, png: { name: "owl.png", path: "export/owl.png" }, status: ["not uploaded"] },
    ]);
  });
  it("a JPEG export is not a PNG; a stock the app no longer lists keeps its id", () => {
    const jpg = item("a", { ...files("a"), raster: { relPath: "export/a.jpg", fileName: "a.jpg", ext: "jpg" } });
    expect(stockDataRows(as([jpg]), ["a"], as({ a: { gone: { status: "partial" } } }), names)[0]).toMatchObject({ png: null, status: ["gone: partial"] });
  });
});

describe("Single sheets", () => {
  const sheet = (id: string, boxes: number, excluded: number[]) => ({ id, name: `${id}.png`, boxes: Array.from({ length: boxes }, () => ({})), excluded });
  it("takes the checked sheets: the file name (no folder is known), how many icons are kept", () => {
    expect(sheetDataRows(as([sheet("a", 6, [1, 2]), sheet("b", 4, [])]), ["a"])).toEqual([
      { svg: null, png: { name: "a.png", path: "" }, status: ["4 of 6 icons"] },
    ]);
  });
});

describe("SVG builder", () => {
  const asset = (id: string) => ({ id, svgName: `${id}.svg`, svgPath: `Sea/${id}.svg` });
  it("takes the placed icons: the approved SVG file and its path", () => {
    expect(builderDataRows(as([asset("fish"), asset("owl")]), ["owl"])).toEqual([
      { svg: { name: "owl.svg", path: "Sea/owl.svg" }, png: null, status: ["Approved"] },
    ]);
  });
});
