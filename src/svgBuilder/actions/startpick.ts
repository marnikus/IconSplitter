// actions/startpick.ts — the icons a NEW final artboard starts with (2026-11-14):
// the icons on the stage now, in their cells, and the free cells drawn by the
// current recipe (Similar without an indexed reference draws at random).
// Excluded icons stay out. No folder → no icons.
import { reshuffleSheet } from "../../lib/svgBuilder/selection";
import { placedOnly } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext } from "../actiontypes";

export function startIcons(ctx: BuilderActionContext, capacity: number): string[] {
  if (ctx.assets.length === 0 || capacity <= 0) return [];
  const current = ctx.placedIds.slice(0, capacity);
  const recipe = ctx.model.recipe.mode === "similar" && ctx.reference.image === null ? { ...ctx.model.recipe, mode: "random" as const } : ctx.model.recipe;
  return reshuffleSheet({
    assets: ctx.assets, profiles: ctx.profiles, recipe, seed: ctx.model.seed + 1, capacity, current,
    lockedIds: placedOnly(current), // the stage's icons keep their cells
    score: ctx.reference.image === null ? undefined : ctx.scoreOf, excludedIds: ctx.model.excludedIds,
  }).ids;
}
