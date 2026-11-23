// @vitest-environment happy-dom
// svg_builder_register.test.ts — hand-added folders under _artboard_sheets join
// the lists (2026-11-16): template folders (template.json) first, then artboard
// folders (sheet.json / metadata.json) inside any known template's folder.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { findSheetFolders } from "../src/svgBuilder/actions/register";
import { registerPlan } from "../src/lib/svgBuilder/registerplan";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function dirAt(root: FakeDir, path: string): FakeDir {
  return path.split("/").reduce((d, part) => {
    if (!d.children.has(part)) d.children.set(part, new FakeDir(part));
    return d.children.get(part) as FakeDir;
  }, root);
}
const put = (root: FakeDir, path: string, text: string, mtime = 1) => {
  const cut = path.lastIndexOf("/");
  dirAt(root, path.slice(0, cut)).children.set(path.slice(cut + 1), new FakeFile(path.slice(cut + 1), text.length, mtime, text));
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

import { newArtboard } from "../src/lib/svgBuilder/artboards";
import { parseSheetConfig } from "../src/lib/svgBuilder/config";
import { artboardSheetJson, sigOf } from "../src/lib/svgBuilder/sheetsync";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";

// Register also reads back what changed OUTSIDE the app (2026-11-22): every file
// the app wrote carries its fingerprint, so only a really edited file is read.
describe("register updates known templates and artboards from their edited files", () => {
  const asset = (id: string, name: string) => ({ id, name, title: name, label: name, base: name, suffix: "_AI.svg" }) as unknown as BuilderIconAsset;
  const assets = [asset("p-bowl", "Bowl"), asset("p-cup", "Cup"), asset("p-fork", "Fork")];
  const saved = "2026-11-20T10:00:00.000Z";
  const tpl = { ...newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, background: "#112233" } }), [], saved, "tpl-k"), folder: KNOWN };
  const art = { ...newArtboard(tpl, [], { now: saved, id: "art-k", placedIds: ["p-bowl", "p-cup"] }), title: "Kitchen", folder: `${KNOWN}/artboard_01_kitchen` };
  const blueprint = (background: string) => JSON.stringify({ format: "iconsplitter-sheet-preset", version: 2, config: { ...tpl.config, banner: { ...tpl.config.banner, background } } });
  const sheet = (edit?: (raw: Record<string, any>) => void) => {
    const raw = artboardSheetJson(art, tpl, { assets, seed: 1, recipe: {} as never }) as Record<string, any>;
    edit?.(raw);
    return JSON.stringify(raw);
  };
  const plan = async (root: FakeDir, sigs: Record<string, string>) => registerPlan({
    found: await findSheetFolders(root), templates: [tpl], artboards: [art], assets, now: "2026-11-22T12:00:00.000Z", newId: (k) => `${k}-new`, sig: (p) => sigs[p],
  });

  it("an edited template.json updates the template's look; the app's own copy (fingerprint matches) is never read back", async () => {
    const root = new FakeDir("Picked");
    put(root, `${KNOWN}/template.json`, blueprint("#FF0000"));
    const edited = await plan(root, { [`${KNOWN}/template.json`]: sigOf(blueprint("#112233")) });
    expect(edited.templates[0].config.banner.background).toBe("#FF0000");
    expect(edited.templates[0]).toMatchObject({ id: "tpl-k", name: tpl.name, folder: KNOWN, updated: "2026-11-22T12:00:00.000Z" });
    expect(edited.updated).toEqual({ templates: ["tpl-k"], artboards: [] });
    expect(edited.adopt).toContainEqual([`${KNOWN}/template.json`, blueprint("#FF0000")]);
    const ours = await plan(root, { [`${KNOWN}/template.json`]: sigOf(blueprint("#FF0000")) }); // a stale copy the app wrote itself
    expect(ours.templates[0].config.banner.background).toBe("#112233");
    expect(ours.updated).toEqual({ templates: [], artboards: [] });
  });

  it("a template.json from before fingerprints is read only when it is newer than the template's last save", async () => {
    const newer = new FakeDir("Picked");
    put(newer, `${KNOWN}/template.json`, blueprint("#FF0000"), Date.parse(saved) + 60_000);
    expect((await plan(newer, {})).templates[0].config.banner.background).toBe("#FF0000");
    const older = new FakeDir("Picked");
    put(older, `${KNOWN}/template.json`, blueprint("#FF0000"), Date.parse(saved) - 60_000);
    expect((await plan(older, {})).templates[0].config.banner.background).toBe("#112233");
  });

  it("an edited sheet.json / metadata.json updates its artboard; unedited or older files are left alone", async () => {
    const root = new FakeDir("Picked");
    put(root, `${KNOWN}/template.json`, blueprint("#112233"));
    const text = sheet((raw) => { raw.config.banner.title = "Dining"; raw.icons = ["Fork", "Spoon"]; });
    put(root, `${art.folder}/sheet.json`, text);
    put(root, `${art.folder}/metadata.json`, JSON.stringify({ state: "draft", title: "Dining icons for menus", description: "Outline dining icons", tags: ["dining"] }));
    const sigs = { [`${KNOWN}/template.json`]: sigOf(blueprint("#112233")), [`${art.folder}/sheet.json`]: sigOf(sheet()), [`${art.folder}/metadata.json`]: sigOf("{}") };
    const read = await plan(root, sigs);
    const updated = read.artboards[0];
    expect(updated).toMatchObject({ id: "art-k", title: "Dining", folder: art.folder, updated: "2026-11-22T12:00:00.000Z" });
    expect(updated.placedIds.filter((id) => !id.startsWith("~empty:"))).toEqual(["p-fork"]);
    expect(updated.metadata).toMatchObject({ title: "Dining icons for menus", state: "draft" });
    expect(read.unresolved).toBe(1); // "Spoon"
    expect(read.updated).toEqual({ templates: [], artboards: ["art-k"] });
    expect(read.adopt.map(([p]) => p)).toEqual(expect.arrayContaining([`${art.folder}/sheet.json`, `${art.folder}/metadata.json`]));
    // the app's own copies, or files from before fingerprints, change nothing
    const untouched = await plan(root, { ...sigs, [`${art.folder}/sheet.json`]: sigOf(text), [`${art.folder}/metadata.json`]: undefined as unknown as string });
    expect(untouched.artboards[0]).toBe(art);
  });

  it("with template.json AND an artboard's sheet.json edited, the artboard's own changes are measured against the template it was written with", async () => {
    const root = new FakeDir("Picked");
    put(root, `${KNOWN}/template.json`, blueprint("#FF0000")); // the template restyled outside
    put(root, `${art.folder}/sheet.json`, sheet((raw) => { raw.config.banner.title = "Dining"; })); // only the words changed
    const read = await plan(root, { [`${KNOWN}/template.json`]: "1:0", [`${art.folder}/sheet.json`]: "1:0" });
    expect(read.templates[0].config.banner.background).toBe("#FF0000");
    expect(read.artboards[0].title).toBe("Dining");
    expect(read.artboards[0].overrides).toEqual({}); // the old background is not pinned: it follows the template's new look
  });
});
