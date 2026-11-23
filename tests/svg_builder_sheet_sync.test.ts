// svg_builder_sheet_sync.test.ts — the pure part of keeping the builder's JSON
// files and the app in step (2026-11-22): the app fingerprints every file it
// writes or reads, so a file changed OUTSIDE the app is told apart from the
// app's own copy (old or a draft); what an edited template.json / sheet.json /
// metadata.json means for its template or artboard; when an artboard and its
// file say the same thing.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { artboardConfig, newArtboard } from "../src/lib/svgBuilder/artboards";
import { acceptSheetMetadata } from "../src/lib/svgBuilder/metadata";
import { presetJsonOf } from "../src/lib/svgBuilder/presetjson";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";
import {
  artboardFromMetaFile, artboardFromSheet, artboardSheetJson, fileState, metaFileJson, olderThanSave, parseFileSigs, sameArtboard, sameMetaFile, sigOf,
  syncDecision, templateLookFromFile,
} from "../src/lib/svgBuilder/sheetsync";

const asset = (id: string, name: string) => ({ id, name, title: name, label: name, base: name, suffix: "_AI.svg" }) as unknown as BuilderIconAsset;
const assets = [asset("p-bowl", "Bowl"), asset("p-cup", "Cup"), asset("p-fork", "Fork")];
const tpl = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, background: "#112233" } }), [], "2026-11-20T10:00:00.000Z", "tpl-1");
const board = { ...newArtboard(tpl, [], { now: "t", id: "art-1", placedIds: ["p-bowl", "~empty:0", "p-cup"] }), title: "Kitchen", subtitle: "Line icons" };
const sheetOf = (a: typeof board, template = tpl) => JSON.stringify(artboardSheetJson(a, template, { assets, seed: 7, recipe: { mode: "random" } as never }));

describe("fingerprints and file states", () => {
  it("a file is missing, the app's own (fingerprint matches), edited outside, or from before fingerprints", () => {
    expect(sigOf("abc")).toBe(sigOf("abc"));
    expect(sigOf("abc")).not.toBe(sigOf("abd"));
    expect(fileState(null, undefined)).toBe("missing");
    expect(fileState("x", sigOf("x"))).toBe("ours");
    expect(fileState("y", sigOf("x"))).toBe("edited");
    expect(fileState("x", undefined)).toBe("legacy");
    expect(parseFileSigs({ "_artboard_sheets/a/template.json": sigOf("x"), "../x": "1:aa", "_artboard_sheets/b/sheet.json": 7, junk: "nope" }))
      .toEqual({ "_artboard_sheets/a/template.json": sigOf("x") });
    expect(parseFileSigs("junk")).toEqual({});
  });

  it("decides what the app does with its file: keep an outside edit, adopt or refresh its own copy, back up a differing older one first", () => {
    expect(syncDecision("edited", false, true)).toBe("keep"); // Register reads it
    expect(syncDecision("edited", true, true)).toBe("keep");
    expect(syncDecision("ours", true, false)).toBe("keep");
    expect(syncDecision("legacy", true, false)).toBe("adopt");
    expect(syncDecision("ours", false, false)).toBe("write"); // the app's older copy
    expect(syncDecision("missing", false, false)).toBe("write");
    expect(syncDecision("legacy", false, true)).toBe("backup-write");
    expect(syncDecision("legacy", false, false)).toBe("keep"); // maybe an outside edit: Register decides
    const saved = "2026-11-20T10:00:00.000Z";
    expect(olderThanSave(Date.parse(saved) - 5000, saved)).toBe(true);
    expect(olderThanSave(Date.parse(saved) - 1000, saved)).toBe(false); // the disk's clock steps
    expect(olderThanSave(Date.parse(saved) + 5000, saved)).toBe(false);
    expect(olderThanSave(0, "not a date")).toBe(false);
  });
});

describe("what an edited file means", () => {
  it("template.json: its look (merged onto the template, words as sample text); unreadable JSON = null", () => {
    const text = JSON.stringify({ config: { banner: { background: "#FF0000" }, grid: { columns: 5 } } });
    const look = templateLookFromFile(tpl, text)!;
    expect(look.banner.background).toBe("#FF0000");
    expect(look.grid.columns).toBe(5);
    expect(look.grid.rows).toBe(tpl.config.grid.rows); // left out = kept
    expect(templateLookFromFile(tpl, "{nope")).toBeNull();
  });

  it("sheet.json: words, icons by name, locks and look changes onto the artboard — look changes measured against the given template", () => {
    const raw = JSON.parse(sheetOf(board));
    raw.config.banner.title = "Dining";
    raw.config.banner.background = "#00FF00"; // its own look change
    raw.icons = ["Fork", null, "Cup", "Spoon"]; // Spoon is not in the library
    raw.lockedIcons = ["Fork"];
    const read = artboardFromSheet(board, tpl, JSON.stringify(raw), assets)!;
    expect(read.artboard.title).toBe("Dining");
    expect(read.artboard.subtitle).toBe("Line icons");
    expect(read.artboard.placedIds.filter((id) => !id.startsWith("~empty:"))).toEqual(["p-fork", "p-cup"]);
    expect(read.artboard.lockedIds).toEqual(["p-fork"]);
    expect(read.artboard.overrides).toEqual({ banner: { background: "#00FF00" } });
    expect(read.unresolved).toEqual(["Spoon"]);
    expect(artboardFromSheet(board, tpl, "{nope", assets)).toBeNull();
    // a file written with the template's look adds no look change of its own
    expect(artboardFromSheet(board, tpl, sheetOf(board), assets)!.artboard.overrides).toEqual({});
  });

  it("metadata: an edit of accepted metadata is 'edited' until Accept; the same words keep it as it is; cleared fields = none", () => {
    const tags = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "kitchen", "cooking", "recipe"];
    const fields = { title: "Kitchen line icons for cooking apps", description: "Simple outline kitchen icons for recipe and cooking apps", tags };
    const accepted = { ...board, metadata: acceptSheetMetadata(fields) };
    expect(accepted.metadata.state).toBe("accepted");
    const same = artboardFromMetaFile(accepted, JSON.stringify({ state: "accepted", ...fields }))!;
    expect(same.metadata).toBe(accepted.metadata);
    const edited = artboardFromMetaFile(accepted, JSON.stringify({ state: "accepted", ...fields, title: "Kitchen outline icons for cooking apps" }))!;
    expect(edited.metadata).toMatchObject({ title: "Kitchen outline icons for cooking apps", state: "edited" });
    expect(artboardFromMetaFile(accepted, JSON.stringify({ title: "", description: "", tags: [] }))!.metadata).toBeNull();
    expect(artboardFromMetaFile(accepted, "[1]")).toBeNull();
    const merged = metaFileJson(JSON.stringify({ v: 1, at: "then", prompt: "P", model: "M", artboardTitle: "AI title", title: "old" }), edited.metadata);
    expect(merged).toMatchObject({ v: 1, at: "then", prompt: "P", model: "M", artboardTitle: "AI title", title: "Kitchen outline icons for cooking apps", state: "edited" });
    expect(metaFileJson(null, null)).toMatchObject({ state: "empty", title: "", description: "", tags: [] });
    // the file already says what the app holds only with the same words AND state
    expect(sameMetaFile(JSON.stringify(metaFileJson(null, accepted.metadata)), accepted.metadata)).toBe(true);
    expect(sameMetaFile(JSON.stringify({ ...metaFileJson(null, accepted.metadata), state: "draft" }), accepted.metadata)).toBe(false);
    expect(sameMetaFile(JSON.stringify({ ...metaFileJson(null, accepted.metadata), title: "Other words here now" }), accepted.metadata)).toBe(false);
    expect(sameMetaFile(JSON.stringify(metaFileJson(null, null)), null)).toBe(true);
    expect(sameMetaFile("[]", null)).toBe(false);
  });

  it("an artboard and its file are the same whatever empty cells are called, trailing empty cells or lock order", () => {
    const twin = { ...board, placedIds: ["p-bowl", "~empty:5", "p-cup", "~empty:1"], updated: "later", lockedIds: [] };
    expect(sameArtboard(board, twin, tpl)).toBe(true);
    expect(sameArtboard({ ...board, lockedIds: ["p-cup", "p-bowl"] }, { ...board, lockedIds: ["p-bowl", "p-cup"] }, tpl)).toBe(true);
    expect(sameArtboard(board, { ...board, title: "Other" }, tpl)).toBe(false);
    expect(sameArtboard(board, { ...board, overrides: { grid: { columns: 3 } } }, tpl)).toBe(false);
    expect(sameArtboard(board, { ...board, placedIds: ["p-cup", "p-bowl"] }, tpl)).toBe(false);
    // the file's whole sheet: the template's CURRENT look + the artboard's own changes
    const restyled = { ...tpl, config: parseSheetConfig({ ...tpl.config, banner: { ...tpl.config.banner, background: "#445566" } }) };
    expect(JSON.parse(sheetOf(board, restyled)).config.banner.background).toBe("#445566");
    expect(JSON.parse(sheetOf(board)).config).toEqual(JSON.parse(JSON.stringify(artboardConfig(tpl, board))));
    expect(JSON.parse(sheetOf(board)).icons).toEqual(presetJsonOf({ name: "x", config: tpl.config, placedIds: board.placedIds, lockedIds: [], seed: 0, recipe: {} as never, metadata: null, assets }).icons);
  });
});
