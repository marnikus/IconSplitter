// undo.ts — validated payload for one global builder-config undo step. The
// payload is absolute, so coalescing a slider gesture cannot lose its first
// edit (RULE 12).
import { isRecord } from "../isrecord";
import { parseSheetConfig } from "./config";
import { parseSelectionRecipe } from "./selection";
import type { BuilderUndoPatch } from "./types";

export function parseBuilderUndoPatch(raw: unknown): BuilderUndoPatch | null {
  if (!isRecord(raw) || !isRecord(raw.config) || !isRecord(raw.recipe)) return null;
  if (!Array.isArray(raw.lockedIds) || !raw.lockedIds.every((id) => typeof id === "string")) return null;
  const seed = typeof raw.seed === "number" && Number.isFinite(raw.seed) ? Math.floor(raw.seed) : null;
  if (seed === null) return null;
  return {
    config: parseSheetConfig(raw.config), seed,
    lockedIds: [...new Set(raw.lockedIds as string[])],
    recipe: parseSelectionRecipe(raw.recipe),
  };
}

export function builderUndoPatchOf(raw: BuilderUndoPatch): BuilderUndoPatch {
  return {
    config: parseSheetConfig(raw.config), seed: Math.floor(raw.seed),
    lockedIds: [...new Set(raw.lockedIds)], recipe: parseSelectionRecipe(raw.recipe),
  };
}
