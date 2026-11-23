// svg_builder_removal_plan.test.ts — the pure part of removing templates and
// artboards as ONE undo step (2026-11-22): what the two lists become, and which
// folders under _artboard_sheets move into its `.removed versions` trash (and
// back on undo) — never _artboard_sheets itself, never a folder still holding
// something kept, an artboard folder inside a moving template folder moves with it.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate, type SheetTemplate } from "../src/lib/svgBuilder/templates";
import { newArtboard, type FinalArtboard } from "../src/lib/svgBuilder/artboards";
import {
  SHEETS_TRASH, addSides, applyListsDelta, artboardsRemoval, folderMoves, isSheetFolderPath, parseFolderMoves, parseListsDelta,
  removalLabel, removalSay, removalSides, templatesRemoval, trashFolderOf, trashStamp,
} from "../src/lib/svgBuilder/removal";

const DAY = "_artboard_sheets/2026-11/2026-11-22";
const tpl = (id: string, folder: string | null): SheetTemplate => ({ ...newTemplate(DEFAULT_CONFIG, [id], "t", id), name: `T ${id}`, folder });
const art = (id: string, template: SheetTemplate, folder: string | null): FinalArtboard => ({ ...newArtboard(template, [], { now: "t", id }), name: `A ${id}`, folder });

const t1 = tpl("t1", `${DAY}/one`);
const t2 = tpl("t2", `${DAY}/two`);
const a1 = art("a1", t1, `${DAY}/one/artboard_01_x`);
const a2 = art("a2", t1, `${DAY}/one/artboard_02_y`);
const a3 = art("a3", t2, `${DAY}/two/artboard_01_x`);
const lists = { templates: [t1, t2], artboards: [a1, a2, a3] };

describe("removal plan (2026-11-22)", () => {
  it("names a trash folder after the folder and a stamp; paths stay inside _artboard_sheets", () => {
    expect(trashStamp(new Date(2026, 10, 22, 9, 5, 7), "ab12")).toBe("20261122-090507-ab12");
    expect(trashFolderOf(`${DAY}/one`, "S")).toBe(`${SHEETS_TRASH}/one~S`);
    expect(SHEETS_TRASH).toBe("_artboard_sheets/.removed versions");
    expect([`${DAY}/one`, "_artboard_sheets/x", `${SHEETS_TRASH}/one~S`].map(isSheetFolderPath)).toEqual([true, true, true]);
    expect(["_artboard_sheets", SHEETS_TRASH, "_artboard_sheets/../x", "other/x", "_artboard_sheets//x", "_artboard_sheets/./x", ""].map(isSheetFolderPath))
      .toEqual([false, false, false, false, false, false, false]);
  });

  it("a removed template takes its artboards and moves its folder — the artboard folders inside it move with it", () => {
    const plan = templatesRemoval(lists, ["t1"], "S")!;
    expect(plan.after.templates.map((t) => t.id)).toEqual(["t2"]);
    expect(plan.after.artboards.map((a) => a.id)).toEqual(["a3"]);
    expect(plan.goneArtboards.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(plan.away).toEqual([{ from: `${DAY}/one`, to: `${SHEETS_TRASH}/one~S` }]);
    expect(plan.back).toEqual([{ from: `${SHEETS_TRASH}/one~S`, to: `${DAY}/one` }]);
    expect(plan.before).toEqual(lists);
    expect(removalLabel(plan)).toBe("Remove template “T t1”");
    expect(removalSay(plan)).toBe(`Template “T t1” removed with 2 artboards — its folder is in ${SHEETS_TRASH}. Undo brings them back`);
    expect(templatesRemoval(lists, ["nope"], "S")).toBeNull();
  });

  it("a template whose artboards live elsewhere (an older day) moves both folders; several templates get distinct trash names", () => {
    const moved = { ...a1, folder: "_artboard_sheets/2026-11/2026-11-01/one/artboard_01_x" };
    const plan = templatesRemoval({ templates: [t1, t2], artboards: [moved, a3] }, ["t1", "t2"], "S")!;
    expect(plan.away.map((m) => m.from)).toEqual(["_artboard_sheets/2026-11/2026-11-01/one", `${DAY}/one`, `${DAY}/two`]);
    expect(new Set(plan.away.map((m) => m.to)).size).toBe(3);
    expect(removalLabel(plan)).toBe("Remove 2 templates");
    expect(plan.after).toEqual({ templates: [], artboards: [] });
  });

  it("artboards alone: their own folders move; the template folder stays; a template without a folder moves nothing", () => {
    const plan = artboardsRemoval(lists, ["a1", "a3"], "S")!;
    expect(plan.after.templates).toEqual([t1, t2]);
    expect(plan.after.artboards.map((a) => a.id)).toEqual(["a2"]);
    expect(plan.away.map((m) => m.from)).toEqual([`${DAY}/one/artboard_01_x`, `${DAY}/two/artboard_01_x`]);
    expect(plan.away[0].to).not.toBe(plan.away[1].to); // the same folder name twice: distinct trash names
    expect(removalLabel(plan)).toBe("Remove 2 artboards");
    expect(removalSay(artboardsRemoval(lists, ["a2"], "S")!)).toBe(`Artboard “A a2” removed — its folder is in ${SHEETS_TRASH}. Undo brings it back`);
    const bare = tpl("t9", null);
    expect(templatesRemoval({ templates: [bare], artboards: [] }, ["t9"], "S")!.away).toEqual([]);
    expect(artboardsRemoval(lists, [], "S")).toBeNull();
  });

  it("never moves a folder that still holds something kept, nor anything outside _artboard_sheets", () => {
    expect(folderMoves([`${DAY}/one`], [`${DAY}/one/artboard_02_y`], "S").away).toEqual([]);
    expect(folderMoves(["outside/x", "_artboard_sheets", `${DAY}/one`, `${DAY}/one/artboard_01_x`], [], "S").away.map((m) => m.from)).toEqual([`${DAY}/one`]);
  });

  it("a step holds only what it takes out and puts back (at its place) plus the folder moves — never whole lists", () => {
    const plan = templatesRemoval(lists, ["t1"], "S")!;
    const { before, after } = removalSides(plan);
    expect(after).toEqual({ templatesOut: ["t1"], artboardsOut: ["a1", "a2"], templatesIn: [], artboardsIn: [], moves: plan.away, wholeArtboards: null });
    expect(before.templatesIn).toEqual([{ at: 0, item: t1 }]);
    expect(before.artboardsIn).toEqual([{ at: 0, item: a1 }, { at: 1, item: a2 }]);
    expect(before.moves).toEqual(plan.back);
    expect(applyListsDelta(lists, after)).toEqual({ templates: [t2], artboards: [a3] });
    const t2Saved = { ...t2, name: "T two, saved again" }; // changed after the removal: undo keeps it
    const back = applyListsDelta({ templates: [t2Saved], artboards: [a3] }, before);
    expect(back.templates).toEqual([t1, t2Saved]);
    expect(back.artboards.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(parseListsDelta(JSON.parse(JSON.stringify(before)))).toEqual(before); // read back from the timeline
    expect(parseListsDelta(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });

  it("an artboard comes back only with its template; an older step (a whole artboard list) still applies; junk is refused", () => {
    const { before } = removalSides(artboardsRemoval(lists, ["a1"], "S")!);
    expect(applyListsDelta({ templates: [t2], artboards: [] }, before).artboards).toEqual([]); // t1 is gone: a1 stays out
    const legacy = parseListsDelta({ artboards: [a1, a3] })!;
    expect(applyListsDelta({ templates: [t1, t2], artboards: [a2] }, legacy).artboards.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(parseListsDelta("junk")).toBeNull();
    expect(parseListsDelta({ templatesOut: [5, "t1"], templatesIn: [{ at: "x", item: t1 }, { at: 0, item: { id: "" } }] }))
      .toMatchObject({ templatesOut: ["t1"], templatesIn: [], artboardsIn: [], moves: [], wholeArtboards: null });
  });

  it("adding an artboard is a step of the same kind: out on undo, back at the end on redo", () => {
    const made = art("a9", t2, null);
    const { before, after } = addSides(lists, made);
    expect(applyListsDelta({ ...lists, artboards: [...lists.artboards, made] }, before).artboards.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(applyListsDelta(lists, after).artboards.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a9"]);
    expect(after.moves).toEqual([]);
  });

  it("reads stored moves back field by field: only moves between sheet folders survive", () => {
    const good = { from: `${DAY}/one`, to: `${SHEETS_TRASH}/one~S` };
    expect(parseFolderMoves([good, { from: "../x", to: `${SHEETS_TRASH}/y` }, { from: `${DAY}/one` }, 7, null])).toEqual([good]);
    expect(parseFolderMoves("junk")).toEqual([]);
  });
});
