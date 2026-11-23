// @vitest-environment happy-dom
// svg_builder_register.test.ts — hand-added folders under _artboard_sheets join
// the lists (2026-11-16): template folders (template.json) first, then artboard
// folders (sheet.json / metadata.json) inside any known template's folder.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { findSheetFolders, registerPlan } from "../src/svgBuilder/actions/register";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function dirAt(root: FakeDir, path: string): FakeDir {
  return path.split("/").reduce((d, part) => {
    if (!d.children.has(part)) d.children.set(part, new FakeDir(part));
    return d.children.get(part) as FakeDir;
  }, root);
}
const put = (root: FakeDir, path: string, text: string) => {
  const cut = path.lastIndexOf("/");
  dirAt(root, path.slice(0, cut)).children.set(path.slice(cut + 1), new FakeFile(path.slice(cut + 1), text.length, 1, text));
};
const preset = (title: string, columns: number) => JSON.stringify({ format: "iconsplitter-sheet-preset", version: 2, name: title,
  config: { grid: { columns }, banner: { title, subtitle: "Sub " + title } }, icons: [] });

const KNOWN = "_artboard_sheets/2026-11/2026-11-15/known_sheet";
const NEW = "_artboard_sheets/2026-11/2026-11-16/hand_made";

describe("register hand-added templates and artboards", () => {
  it("finds template folders at any depth and the artboard folders inside them", async () => {
    const root = new FakeDir("Picked");
    put(root, `${NEW}/template.json`, preset("Hand made", 7));
    put(root, `${NEW}/artboard_01_one/sheet.json`, preset("First board", 7));
    put(root, `${NEW}/artboard_02_two/metadata.json`, JSON.stringify({ title: "T", description: "D", tags: ["a"] }));
    dirAt(root, `${NEW}/export_junk`); // no JSON: not an artboard
    const found = await findSheetFolders(root);
    expect(found.map((f) => f.folder)).toEqual([NEW]);
    expect(found[0].artboards.map((a) => a.folder)).toEqual([`${NEW}/artboard_01_one`, `${NEW}/artboard_02_two`]);
  });

  it("registers only what is new: a new template with its artboards, and a new artboard of a known template", async () => {
    const root = new FakeDir("Picked");
    put(root, `${KNOWN}/template.json`, preset("Known", 6));
    put(root, `${KNOWN}/artboard_05_added/sheet.json`, preset("Added by hand", 6));
    put(root, `${NEW}/template.json`, preset("Hand made", 7));
    put(root, `${NEW}/artboard_01_one/sheet.json`, preset("First board", 7));
    const known = { ...newTemplate(DEFAULT_CONFIG, [], "t", "tpl-known"), folder: KNOWN };
    let n = 0;
    const input = { found: await findSheetFolders(root), templates: [known], artboards: [], assets: [], now: "t", newId: (k: string) => `${k}-${++n}` };
    const plan = registerPlan(input);
    expect(plan.templates).toHaveLength(2);
    const made = plan.templates[1];
    expect(made.folder).toBe(NEW);
    expect(made.config.grid.columns).toBe(7);
    expect(plan.artboards.map((a) => [a.templateId, a.folder, a.title])).toEqual([
      ["tpl-known", `${KNOWN}/artboard_05_added`, "Added by hand"],
      [made.id, `${NEW}/artboard_01_one`, "First board"],
    ]);
    // run again with the result: nothing new
    const again = registerPlan({ ...input, templates: plan.templates, artboards: plan.artboards });
    expect([again.templates.length, again.artboards.length]).toEqual([2, 2]);
  });

  it("never registers what waits in _artboard_sheets/.removed versions (2026-11-22)", async () => {
    const root = new FakeDir("Picked");
    put(root, `${NEW}/template.json`, preset("Hand made", 7));
    put(root, "_artboard_sheets/.removed versions/gone_sheet~20261122-090000-ab12/template.json", preset("Removed", 5));
    put(root, `${NEW}/.removed versions/artboard_09_old/sheet.json`, preset("Old board", 7));
    const found = await findSheetFolders(root);
    expect(found.map((f) => f.folder)).toEqual([NEW]);
    expect(found[0].artboards).toEqual([]);
  });

  it("an artboard's metadata.json becomes its metadata", async () => {
    const root = new FakeDir("Picked");
    put(root, `${NEW}/template.json`, preset("Hand made", 7));
    put(root, `${NEW}/artboard_02_two/metadata.json`, JSON.stringify({ title: "Bowls", description: "Line bowls", tags: ["bowl", "kitchen"] }));
    const plan = registerPlan({ found: await findSheetFolders(root), templates: [], artboards: [], assets: [], now: "t", newId: (k) => `${k}-1` });
    expect(plan.artboards[0].metadata).toMatchObject({ title: "Bowls", description: "Line bowls" });
  });
});
