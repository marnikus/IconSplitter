// actions/sheetjson.ts — every artboard folder holds `sheet.json` (2026-11-16):
// the full preset of that artboard (config, icons by name, locks, seed, recipe,
// metadata — presetjson.ts) as the stage shows it NOW, rewritten as the user
// edits (debounced by useSheetJsonSync) and written when the folder is made.
import { ensureDirPath, writeFileOverwrite } from "../../lib/fs";
import type { BuilderActionContext } from "../actiontypes";
import { currentJson } from "./presetjson";
import { sheetsRoot } from "./sheetsroot";

export const SHEET_JSON = "sheet.json";
/** What was last written per folder: an unchanged sheet is not written again. */
const written = new Map<string, string>();

/** Writes the open artboard's sheet.json into `folder` (else its known folder). Answers whether it was written. */
export async function writeSheetJson(get: () => BuilderActionContext, folder?: string | null): Promise<boolean> {
  const ctx = get();
  const artboard = ctx.model.artboards.find((a) => a.id === ctx.model.editingArtboardId);
  const dir = folder ?? artboard?.folder ?? null;
  const root = sheetsRoot(ctx, true);
  if (artboard === undefined || dir === null || root === null) return false;
  const text = `${JSON.stringify(currentJson(ctx), null, 2)}\n`;
  if (written.get(dir) === text) return false;
  try {
    await writeFileOverwrite(await ensureDirPath(root, dir), SHEET_JSON, new Blob([text], { type: "application/json" }));
    written.set(dir, text);
    return true;
  } catch { return false; }
}
