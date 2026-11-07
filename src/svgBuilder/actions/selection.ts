// actions/selection.ts — the reference selection behaviour. Placement changes
// are ONE global selection entry each; the recipe, seed and locks are working
// state (as in the reference) and do not add undo entries of their own.
import { recipeCaption, reshuffleSheet, resizeSheet, shortfallMessage, type SheetPick } from "../../lib/svgBuilder/selection";
import type { SelectionRecipe } from "../../lib/svgBuilder/types";
import { saveBuilderListView } from "../listview";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type SelectionActions = Pick<BuilderActions,
  "setRecipe" | "reshuffle" | "toggleAsset" | "toggleLock" | "clearSelection" | "setCategory" | "autoPlace" | "fitSelection">;

export const FULL_MESSAGE = "Every cell is filled. Deselect an icon first, or add a row to the grid.";

export function selectionActions(get: () => BuilderActionContext): SelectionActions {
  return {
    setRecipe: (patch) => setRecipe(get(), patch),
    reshuffle: () => reshuffle(get(), get().model.recipe, { toast: true }),
    toggleAsset: (id) => toggleAsset(get(), id),
    toggleLock: (id) => toggleLock(get(), id),
    clearSelection: () => { get().dispatch({ lockedIds: [] }); place(get(), [], "Clear the sheet"); },
    setCategory: (category) => setCategory(get(), category),
    autoPlace: () => autoPlace(get()),
    fitSelection: () => fitSelection(get()),
  };
}

function pickOf(ctx: BuilderActionContext, recipe: SelectionRecipe, seed: number): SheetPick {
  return { assets: ctx.assets, profiles: ctx.profiles, recipe, seed, capacity: ctx.layout.capacity,
    current: ctx.placedIds, lockedIds: ctx.model.lockedIds, score: ctx.reference.image === null ? undefined : ctx.scoreOf };
}

export const NO_REFERENCE = "Similar needs an indexed reference: run Icons indexing, then lock (or place) an icon to compare against.";

function place(ctx: BuilderActionContext, ids: readonly string[], label: string): void {
  ctx.setChecked({ checked: [...ids], anchor: null, active: ids[0] ?? null }, label);
}

/** A mode / profile / threshold / category change re-picks with seed + 1 (threshold: no toast). */
function setRecipe(ctx: BuilderActionContext, patch: Partial<SelectionRecipe>): void {
  const recipe = { ...ctx.model.recipe, ...patch };
  ctx.dispatch({ recipe });
  reshuffle(ctx, recipe, { toast: patch.threshold === undefined });
}

function reshuffle(ctx: BuilderActionContext, recipe: SelectionRecipe, opts: { toast: boolean }): void {
  if (ctx.assets.length === 0) return ctx.say("Open a folder with approved SVGs first", true);
  if (recipe.mode === "similar" && ctx.reference.image === null) return ctx.say(NO_REFERENCE, true);
  const seed = ctx.model.seed + 1;
  const result = reshuffleSheet(pickOf(ctx, recipe, seed));
  ctx.dispatch({ seed });
  place(ctx, result.ids, `Reshuffle ${result.ids.length} icons`);
  if (result.shortfall !== null && opts.toast) ctx.say(shortfallMessage(recipe, result.shortfall), true);
  else ctx.say(`${result.ids.length} icons · ${recipeCaption(recipe)} · seed ${seed}`);
}

/** Library click: in the sheet → remove (and unlock), later cells shift up; else append to the first free cell. */
function toggleAsset(ctx: BuilderActionContext, id: string): void {
  if (ctx.placedIds.includes(id)) {
    ctx.dispatch({ lockedIds: ctx.model.lockedIds.filter((x) => x !== id) });
    return place(ctx, ctx.placedIds.filter((x) => x !== id), "Remove an icon from the sheet");
  }
  if (ctx.placedIds.length >= ctx.layout.capacity) return ctx.say(FULL_MESSAGE, true);
  place(ctx, [...ctx.placedIds, id], "Add an icon to the sheet");
}

function toggleLock(ctx: BuilderActionContext, id: string): void {
  const has = ctx.model.lockedIds.includes(id);
  ctx.dispatch({ lockedIds: has ? ctx.model.lockedIds.filter((x) => x !== id) : [...ctx.model.lockedIds, id] });
}

/** Category chips filter the library; in Filtered mode they also re-pick. */
function setCategory(ctx: BuilderActionContext, category: string): void {
  const listView = { ...ctx.model.listView, category };
  ctx.dispatch({ listView });
  saveBuilderListView(listView);
  if (ctx.model.recipe.mode === "filtered") setRecipe(ctx, { category });
  else ctx.dispatch({ recipe: { ...ctx.model.recipe, category } });
}

/** First scan with an empty sheet: draw the current recipe once, without an undo entry. */
function autoPlace(ctx: BuilderActionContext): void {
  if (ctx.assets.length === 0) return;
  const known = new Set(ctx.assets.map((a) => a.id));
  const kept = ctx.placedIds.filter((id) => known.has(id));
  if (kept.length !== ctx.placedIds.length) return ctx.setCheckedQuiet(kept.length > 0 ? kept : reshuffleSheet(pickOf(ctx, ctx.model.recipe, ctx.model.seed)).ids);
  if (ctx.placedIds.length > 0) return;
  const recipe = ctx.model.recipe.mode === "similar" ? { ...ctx.model.recipe, mode: "random" as const } : ctx.model.recipe;
  const result = reshuffleSheet(pickOf(ctx, recipe, ctx.model.seed));
  ctx.setCheckedQuiet(result.ids);
}

/** The grid's cell count changed: shrink truncates, grow appends seeded picks (no undo entry, no seed change). */
function fitSelection(ctx: BuilderActionContext): void {
  if (ctx.assets.length === 0 || ctx.placedIds.length === 0) return;
  const next = resizeSheet(pickOf(ctx, ctx.model.recipe, ctx.model.seed));
  if (next.length !== ctx.placedIds.length || next.some((id, i) => id !== ctx.placedIds[i])) ctx.setCheckedQuiet(next);
}
