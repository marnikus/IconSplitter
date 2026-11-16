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

/** A blueprint from the template alone (an older template, first written by an artboard). */
function blueprintOf(ctx: BuilderActionContext, template: SheetTemplate): Record<string, unknown> {
  return presetJsonOf({ name: template.config.banner.title, config: template.config, placedIds: [], lockedIds: [],
    seed: ctx.model.seed, recipe: ctx.model.recipe, metadata: null, assets: ctx.assets });
}

/** Writes the template's folder and template.json; remembers the folder on the template. Answers the folder, or null. */
export async function writeTemplateFolder(get: () => BuilderActionContext, template: SheetTemplate, json?: Record<string, unknown>): Promise<string | null> {
  const ctx = get();
  if (ctx.model.root === null) return null;
  const folder = templateFolder(template, new Date());
  try {
    await writeTemplateBlueprint(ctx.model.root, folder, json ?? blueprintOf(ctx, template));
  } catch (error) {
    ctx.say(`Template folder not written — ${error instanceof Error ? error.message : "the folder may be read-only"}`, true);
    return null;
  }
  const now = get();
  if (now.model.templates.find((t) => t.id === template.id)?.folder !== folder) {
    const templates = now.model.templates.map((t) => (t.id === template.id ? { ...t, folder } : t));
    now.dispatch({ templates });
    saveTemplates(templates);
  }
  return folder;
}
