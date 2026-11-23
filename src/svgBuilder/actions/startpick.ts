// actions/startpick.ts — the icons a NEW final artboard starts with (2026-11-14):
// ONE icon drawn at random from the library (excluded icons and unchecked STYLES stay out) in
// the first cell; every other cell starts empty, ready to fill. No folder → none.
import { reshuffleSheet } from "../../lib/svgBuilder/selection";
import type { BuilderActionContext } from "../actiontypes";

export function startIcons(ctx: BuilderActionContext, capacity: number): string[] {
  if (ctx.pickable.length === 0 || capacity <= 0) return [];
  return reshuffleSheet({
    // only icons of the STYLES sheets allow (2026-11-23)
    assets: ctx.pickable, profiles: ctx.profiles, recipe: { ...ctx.model.recipe, mode: "random", category: "All" },
    seed: Math.floor(Math.random() * 2 ** 31), capacity: 1, current: [], lockedIds: [], excludedIds: ctx.model.excludedIds,
  }).ids.slice(0, 1);
}
