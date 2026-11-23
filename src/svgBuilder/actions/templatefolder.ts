// actions/templatefolder.ts — a template's own folder (2026-11-16): made as soon
// as the template is created (and refreshed on every save), under
// `_artboard_sheets/<month>/<day>/<title>_sheet_<cells>_icons_<colours>_palette_id<code>/`,
// with `template.json` — the sheet preset (config, icons by name, locks, seed,
// recipe, metadata) that rebuilds the design. Every artboard of the template is
// saved inside this folder (sheetfolders.ts). No folder open → nothing written yet;
// it is made the first time one of its artboards is written.
import { presetJsonOf } from "../../lib/svgBuilder/presetjson";
import { templateFolder } from "../../lib/svgBuilder/sheetfolders";
import type { SheetTemplate } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext } from "../actiontypes";
import { saveTemplates } from "../templatestore";
import { writeTemplateBlueprint } from "../sheetwriter";
import { probePath, type DirHandleLike } from "../../lib/fs";
import { fileState } from "../../lib/svgBuilder/sheetsync";
import { knownSig } from "../filesigstore";
import { readSheetFile } from "../sheetfiles";
import { sheetsRoot } from "./sheetsroot";

/**
 * The template's previous folder after it moved home (2026-11-16): removed only
 * when it holds nothing but the app's own template.json — never anything else.
 */
async function dropStray(root: DirHandleLike, folder: string): Promise<void> {
  const cut = folder.lastIndexOf("/");
  const parent = await probePath(root, folder.slice(0, cut));
  const dir = parent === null ? null : await probePath(parent, folder.slice(cut + 1));
  if (parent === null || dir === null || parent.removeEntry === undefined || dir.removeEntry === undefined) return;
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  if (names.length !== 1 || names[0] !== "template.json") return;
  try { await dir.removeEntry("template.json"); await parent.removeEntry(folder.slice(cut + 1)); } catch { /* left as it was */ }
}

/** A blueprint from the template alone (an older template first written by an artboard; a stale copy refreshed, 2026-11-22). */
export function blueprintOf(ctx: BuilderActionContext, template: SheetTemplate): Record<string, unknown> {
  return presetJsonOf({ name: template.config.banner.title, config: template.config, placedIds: [], lockedIds: [],
    seed: ctx.model.seed, recipe: ctx.model.recipe, metadata: null, assets: ctx.assets });
}

/** True when the file was changed outside the app since the app last wrote or read it (2026-11-22). */
async function changedOutside(root: DirHandleLike, path: string): Promise<boolean> {
  const file = await readSheetFile(root, path).catch(() => null);
  return file !== null && fileState(file.text, knownSig(path)) === "edited";
}

/** Writes the template's folder and template.json; remembers the folder on the template. Answers the folder, or null. */
export async function writeTemplateFolder(get: () => BuilderActionContext, template: SheetTemplate, json?: Record<string, unknown>): Promise<string | null> {
  const ctx = get();
  const root = sheetsRoot(ctx, true);
  if (root === null) return null;
  const folder = templateFolder(template, new Date(), ctx.model.artboards); // where its artboards live, when any do
  const outside = await changedOutside(root, `${folder}/template.json`);
  try {
    await writeTemplateBlueprint(root, folder, json ?? blueprintOf(ctx, template));
  } catch (error) {
    ctx.say(`Template folder not written — ${error instanceof Error ? error.message : "the folder may be read-only"}`, true);
    return null;
  }
  if (outside) ctx.say(`template.json of “${template.name}” had changes made outside the app — this save replaced them (🗂 Register reads outside changes)`, true);
  const before = template.folder ?? null;
  if (before !== null && before !== folder) await dropStray(root, before);
  rememberFolder(get(), template.id, folder);
  return folder;
}

/** The template remembers its folder (written at once; nothing when it already does). */
function rememberFolder(ctx: BuilderActionContext, id: string, folder: string): void {
  if (ctx.model.templates.find((t) => t.id === id)?.folder === folder) return;
  const templates = ctx.model.templates.map((t) => (t.id === id ? { ...t, folder } : t));
  ctx.dispatch({ templates });
  saveTemplates(templates);
}
