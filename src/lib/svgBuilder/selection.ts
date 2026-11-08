// selection.ts — the reference "Selection recipe": Similar / Random / Filtered
// pools, a seeded draw, locked icons that keep their cell, a seeded top-up from
// the whole library that is always REPORTED (shortfall), and grid grow/shrink.
import { isRecord } from "../isrecord";
import { scoreOf } from "./assets";
import { isSelectionMode } from "./config";
import { RANGES, clampTo } from "./ranges";
import type { BuilderIconAsset, BuilderProfile, SelectionRecipe, SelectionResult } from "./types";

export const DEFAULT_SEED = 2841;

export const DEFAULT_SELECTION_RECIPE: SelectionRecipe = {
  mode: "similar", profileId: "", threshold: 70, category: "All", textWeight: 50,
};

export interface SheetPick {
  assets: readonly BuilderIconAsset[];
  profiles: readonly BuilderProfile[];
  recipe: SelectionRecipe;
  seed: number;
  capacity: number;
  current: readonly string[];
  lockedIds: readonly string[];
  /** Vector similarity to the reference (0–1); null = not indexed. When given, Similar uses it instead of tag profiles. */
  score?: (asset: BuilderIconAsset) => number | null;
  /** Icons the user removed with the artboard ×: never drawn, topped up or appended until restored. */
  excludedIds?: readonly string[];
}

/** The pick with excluded icons taken out of the library it draws from. */
function withoutExcluded(p: SheetPick): SheetPick {
  if (!p.excludedIds || p.excludedIds.length === 0) return p;
  const out = new Set(p.excludedIds);
  return { ...p, assets: p.assets.filter((a) => !out.has(a.id)) };
}

export function parseSelectionRecipe(raw: unknown): SelectionRecipe {
  if (!isRecord(raw)) return { ...DEFAULT_SELECTION_RECIPE };
  const d = DEFAULT_SELECTION_RECIPE;
  return {
    mode: isSelectionMode(raw.mode) ? raw.mode : d.mode,
    profileId: typeof raw.profileId === "string" ? raw.profileId.slice(0, 80) : d.profileId,
    threshold: clampTo(RANGES.threshold, raw.threshold, d.threshold),
    category: typeof raw.category === "string" && raw.category !== "" ? raw.category.slice(0, 80) : d.category,
    textWeight: clampTo(RANGES.textWeight, raw.textWeight, d.textWeight),
  };
}

/** The profile a recipe means: its id, else the first profile (a category, when any exist). */
export function profileOf(profiles: readonly BuilderProfile[], recipe: SelectionRecipe): BuilderProfile | undefined {
  return profiles.find((p) => p.id === recipe.profileId) ?? profiles[0];
}

/** The pool a mode draws from; an empty pool means the whole library. */
export function poolOf(assets: readonly BuilderIconAsset[], profiles: readonly BuilderProfile[], recipe: SelectionRecipe,
  score?: SheetPick["score"]): BuilderIconAsset[] {
  if (recipe.mode === "random") return [...assets];
  if (recipe.mode === "filtered") return isAll(recipe.category) ? [...assets] : assets.filter((a) => a.category === recipe.category);
  if (score !== undefined) return assets.filter((a) => (score(a) ?? -1) * 100 >= recipe.threshold);
  const profile = profileOf(profiles, recipe);
  return assets.filter((a) => scoreOf(a, profile) * 100 >= recipe.threshold);
}

/** Re-draw every unlocked cell; locked icons keep their cell index. */
export function reshuffleSheet(pick: SheetPick): SelectionResult {
  const p = withoutExcluded(pick);
  const locked = new Set(p.lockedIds);
  const slots: (string | null)[] = Array.from({ length: p.capacity }, (_, i) => (locked.has(p.current[i] ?? "") ? p.current[i] : null));
  const kept = new Set(slots.filter((id): id is string => id !== null));
  const pool = poolOf(p.assets, p.profiles, p.recipe, p.score).filter((a) => !kept.has(a.id));
  const open = slots.filter((id) => id === null).length;
  const draw = drawIds(p, pool, kept, open);
  let k = 0;
  const ids = slots.map((id) => id ?? draw[k++] ?? null).filter((id): id is string => id !== null);
  return { ids, shortfall: pool.length < open ? { pool: pool.length + kept.size, cells: p.capacity } : null };
}

/** Grid size change: shrinking truncates; growing appends seeded picks (seed + capacity) not already placed. */
export function resizeSheet(pick: SheetPick): string[] {
  const p = withoutExcluded(pick);
  if (p.current.length >= p.capacity) return p.current.slice(0, p.capacity);
  const have = new Set(p.current);
  const pool = poolOf(p.assets, p.profiles, p.recipe, p.score).filter((a) => !have.has(a.id));
  const extra = drawIds({ ...p, seed: p.seed + p.capacity }, pool, have, p.capacity - p.current.length);
  return [...p.current, ...extra];
}

/** One new icon for one cell (artboard ×): from the recipe's pool, never placed, never excluded; null when none is left. */
export function refillOne(pick: SheetPick): string | null {
  const p = withoutExcluded(pick);
  const have = new Set(p.current);
  const pool = poolOf(p.assets, p.profiles, p.recipe, p.score).filter((a) => !have.has(a.id));
  return drawIds(p, pool, have, 1)[0] ?? null;
}

/** The line under "Reshuffle N icons". */
export function recipeCaption(recipe: SelectionRecipe): string {
  if (recipe.mode === "random") return "Random from the full library";
  if (recipe.mode === "filtered") return isAll(recipe.category) ? "Random from every category" : `Random from ${recipe.category.toLowerCase()}`;
  return `≥ ${recipe.threshold}% similar · ${100 - recipe.textWeight}% look alike + ${recipe.textWeight}% mean alike`;
}

/** The honest shortfall toast (reference wording). */
export function shortfallMessage(recipe: SelectionRecipe, s: { pool: number; cells: number }): string {
  if (recipe.mode === "similar") return `Only ${s.pool} icons are ≥${recipe.threshold}% similar. The next most similar fill the remaining cells.`;
  return `That filter has ${s.pool} icons for ${s.cells} cells. The closest library pick fills the rest.`;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Seeded draw from the pool, topped up from the rest of the library (next most similar with vectors, else seed + 99). */
function drawIds(p: SheetPick, pool: readonly BuilderIconAsset[], taken: ReadonlySet<string>, count: number): string[] {
  const first = shuffled(pool, mulberry32(p.seed)).map((a) => a.id).slice(0, count);
  if (first.length >= count) return first;
  const used = new Set([...taken, ...first]);
  const rest = restOrder(p, p.assets.filter((a) => !used.has(a.id))).map((a) => a.id);
  return [...first, ...rest.slice(0, count - first.length)];
}

function restOrder(p: SheetPick, rest: BuilderIconAsset[]): BuilderIconAsset[] {
  const random = shuffled(rest, mulberry32(p.seed + 99));
  const score = p.score;
  if (p.recipe.mode !== "similar" || score === undefined) return random;
  return random.map((a) => ({ a, s: score(a) ?? -1 })).sort((x, y) => y.s - x.s).map((x) => x.a);
}

function isAll(category: string): boolean {
  return category.trim() === "" || category.trim().toLowerCase() === "all";
}
