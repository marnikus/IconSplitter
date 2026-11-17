// @vitest-environment happy-dom
// svg_builder_icon_edit.test.ts — editing an icon from the artboard (2026-11-15):
// Finish writes the icon's SVG in the builder's folder as one undo step
// (history type builderSvgEdit); undo / redo write the other side back.
import { afterEach, describe, expect, it } from "vitest";
import { applyBuilderSvgEdit, bindBuilderSvgEdit, saveIconEdit } from "../src/svgBuilder/iconedit";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const BEFORE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18"/></svg>';
const AFTER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h10"/></svg>';

function folder(): FakeDir {
  const root = new FakeDir("icons");
  const food = new FakeDir("food");
  food.children.set("apple_AI.svg", new FakeFile("apple_AI.svg", BEFORE.length, 1, BEFORE));
  root.children.set("food", food);
  return root;
}
const fileText = (root: FakeDir) => ((root.children.get("food") as FakeDir).children.get("apple_AI.svg") as FakeFile).text;

let unbind: (() => void) | null = null;
afterEach(() => { unbind?.(); unbind = null; });

describe("icon edit from the artboard", () => {
  it("Finish writes the SVG and records one undo step; undo and redo write the sides back", async () => {
    const root = folder();
    const written: string[] = [];
    unbind = bindBuilderSvgEdit({ root: () => root, written: (_path, markup) => { written.push(markup); } });
    const pushed: Array<{ type: string; before: unknown; after: unknown }> = [];
    const ok = await saveIconEdit({ id: "a", svgPath: "food/apple_AI.svg", label: "apple", before: BEFORE, after: AFTER, push: (e) => { pushed.push(e); } });
    expect(ok).toBe(true);
    expect(fileText(root)).toBe(AFTER);
    expect(written).toEqual([AFTER]); // the artboard redraws with the new text
    expect(pushed).toHaveLength(1);
    expect(pushed[0].type).toBe("builderSvgEdit");
    expect(await applyBuilderSvgEdit(pushed[0].before)).toBe(true);
    expect(fileText(root)).toBe(BEFORE);
    expect(await applyBuilderSvgEdit(pushed[0].after)).toBe(true);
    expect(fileText(root)).toBe(AFTER);
  });

  it("an unchanged Finish writes nothing; without a folder it refuses", async () => {
    const root = folder();
    unbind = bindBuilderSvgEdit({ root: () => root, written: () => undefined });
    const pushed: unknown[] = [];
    expect(await saveIconEdit({ id: "a", svgPath: "food/apple_AI.svg", label: "apple", before: BEFORE, after: BEFORE, push: (e) => { pushed.push(e); } })).toBe(false);
    expect(pushed).toHaveLength(0);
    unbind(); unbind = null;
    expect(await applyBuilderSvgEdit({ svgPath: "food/apple_AI.svg", markup: AFTER })).toBe(false);
  });
});
