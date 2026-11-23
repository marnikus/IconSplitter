// actions/sheetjson.ts — every artboard folder holds `sheet.json` (2026-11-16):
// the full preset of that artboard (config, icons by name, locks, seed, recipe,
// metadata — presetjson.ts). For the artboard OPEN on the stage it is the stage
// as it is NOW, rewritten as the user edits (debounced by useSheetJsonSync) and
// written when the folder is made; the others follow their saved state
// (sheetsync.ts). Since 2026-11-22 a sheet.json changed outside the app is never
// overwritten here: 🗂 Register reads it first (the toast says so once).
import type { DirHandleLike } from "../../lib/fs";
import { fileState, sigOf } from "../../lib/svgBuilder/sheetsync";
import type { BuilderActionContext } from "../actiontypes";
import { knownSig } from "../filesigstore";
import { jsonText, readSheetFile, writeSheetFile } from "../sheetfiles";
import { currentJson } from "./presetjson";
import { sheetsRoot } from "./sheetsroot";

export const SHEET_JSON = "sheet.json";
/** Files already reported as changed outside the app (said once until written again). */
const warned = new Set<string>();

function refuse(get: () => BuilderActionContext, path: string, name: string): false {
  if (!warned.has(path)) {
    warned.add(path);
    get().say(`sheet.json of “${name}” was changed outside the app — 🗂 Register reads it; until then the stage's edits are not written into it`, true);
  }
  return false;
}

/** The open artboard's sheet.json: in `folder`, else its known folder — null without an open artboard, a folder or the sheets root. */
function targetOf(ctx: BuilderActionContext, folder?: string | null): { name: string; path: string; root: DirHandleLike } | null {
  const artboard = ctx.model.artboards.find((a) => a.id === ctx.model.editingArtboardId);
  const dir = folder ?? artboard?.folder ?? null;
  const root = sheetsRoot(ctx, true);
  return artboard === undefined || dir === null || root === null ? null : { name: artboard.name, path: `${dir}/${SHEET_JSON}`, root };
}

/** Writes the open artboard's sheet.json into `folder` (else its known folder). Answers whether it was written. */
export async function writeSheetJson(get: () => BuilderActionContext, folder?: string | null): Promise<boolean> {
  const ctx = get();
  const target = targetOf(ctx, folder);
  if (target === null) return false;
  const text = jsonText(currentJson(ctx));
  if (knownSig(target.path) === sigOf(text)) return false; // already on disk
  try {
    const file = await readSheetFile(target.root, target.path);
    if (file !== null && fileState(file.text, knownSig(target.path)) === "edited") return refuse(get, target.path, target.name);
    await writeSheetFile(target.root, target.path, text);
    warned.delete(target.path);
    return true;
  } catch { return false; }
}
