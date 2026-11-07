// selection.ts — deterministic, honest selection of approved assets. A short
// pool is reported; filling from the whole library is an explicit decision,
// never a silent substitute (RULE 4/9).
import { isRecord } from "../isrecord";
import { compareNames } from "../scan";
import { profilesOf } from "./assets";
import { isSelectionMode } from "./config";
import type { BuilderIconAsset, SelectionRecipe, SelectionResult } from "./types";

export const DEFAULT_SELECTION_RECIPE: SelectionRecipe = {
  mode: "random", profileId: "all", threshold: 50, category: "All", count: 28,
  seed: 2841, lockedIds: [], fillFromFullLibrary: false, query: "",
};

export function parseSelectionRecipe(raw: unknown): SelectionRecipe {
  if (!isRecord(raw)) return { ...DEFAULT_SELECTION_RECIPE };
  return {
    mode: isSelectionMode(raw.mode) ? raw.mode : DEFAULT_SELECTION_RECIPE.mode,
    profileId: text(raw.profileId, DEFAULT_SELECTION_RECIPE.profileId, 80),
    threshold: num(raw.threshold, DEFAULT_SELECTION_RECIPE.threshold, 0, 100),
    category: text(raw.category, DEFAULT_SELECTION_RECIPE.category, 80),
    count: num(raw.count, DEFAULT_SELECTION_RECIPE.count, 1, 400),
    seed: Math.floor(num(raw.seed, DEFAULT_SELECTION_RECIPE.seed, 0, 4_294_967_295)),
    lockedIds: ids(raw.lockedIds),
    fillFromFullLibrary: typeof raw.fillFromFullLibrary === "boolean" ? raw.fillFromFullLibrary : false,
    query: text(raw.query, "", 120),
  };
}

export function selectAssets(assets: readonly BuilderIconAsset[], raw: SelectionRecipe): SelectionResult {
  const recipe = parseSelectionRecipe(raw);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const locked = unique(recipe.lockedIds).map((id) => byId.get(id)).filter(isAsset);
  const lockedIds = new Set(locked.map((asset) => asset.id));
  const pool = assets.filter((asset) => !lockedIds.has(asset.id) && inPool(asset, recipe));
  const notices: string[] = [];
  const ranked = rankPool(assets, pool, recipe, notices);
  const needed = Math.max(0, recipe.count - locked.length);
  const chosen = [...locked.map((a) => a.id), ...ranked.slice(0, needed).map((a) => a.id)];
  const filled = fillIfNeeded(assets, chosen, recipe, notices);
  return { ids: unique(filled).slice(0, recipe.count), notices, poolSize: pool.length,
    usedFallback: filled.length > chosen.length };
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

function rankPool(
  assets: readonly BuilderIconAsset[], pool: readonly BuilderIconAsset[],
  recipe: SelectionRecipe, notices: string[],
): BuilderIconAsset[] {
  if (recipe.mode === "filtered") return [...pool].sort((a, b) => compareNames(a.label, b.label) || compareNames(a.id, b.id));
  const random = mulberry32(recipe.seed);
  if (recipe.mode === "similar") return rankSimilar({ assets, pool, recipe, notices, random });
  return shuffled(pool, random);
}

interface SimilarArgs {
  assets: readonly BuilderIconAsset[]; pool: readonly BuilderIconAsset[];
  recipe: SelectionRecipe; notices: string[]; random: () => number;
}

function rankSimilar({ assets, pool, recipe, notices, random }: SimilarArgs): BuilderIconAsset[] {
  const refs = profilesOf(assets).find((p) => p.id === recipe.profileId)?.tags ?? [];
  if (refs.length === 0) {
    notices.push("This profile has no reference tags — using the seeded order instead");
    return shuffled(pool, random);
  }
  const scored = pool.map((asset) => ({ asset, score: similarity(asset, refs) }));
  const matched = scored.filter((entry) => entry.score * 100 >= recipe.threshold)
    .sort((a, b) => b.score - a.score || compareNames(a.asset.label, b.asset.label));
  if (matched.length === 0) notices.push("No asset reached the similarity threshold");
  return shuffled(matched.map((entry) => entry.asset), random);
}

function similarity(asset: BuilderIconAsset, refs: readonly string[]): number {
  const tags = new Set(asset.tags.map((tag) => tag.toLowerCase()));
  const hits = refs.filter((tag) => tags.has(tag.toLowerCase())).length;
  return refs.length === 0 ? 0 : hits / refs.length;
}

function fillIfNeeded(
  assets: readonly BuilderIconAsset[], chosen: readonly string[],
  recipe: SelectionRecipe, notices: string[],
): string[] {
  if (chosen.length >= recipe.count) return [...chosen];
  if (recipe.fillFromFullLibrary) return fillFromLibrary(assets, chosen, recipe, notices);
  notices.push(`Only ${chosen.length} asset${chosen.length === 1 ? "" : "s"} matched this recipe`);
  return [...chosen];
}

function fillFromLibrary(
  assets: readonly BuilderIconAsset[], chosen: readonly string[],
  recipe: SelectionRecipe, notices: string[],
): string[] {
  const have = new Set(chosen);
  const extra = shuffled(assets.filter((a) => !have.has(a.id)), mulberry32(recipe.seed + 1))
    .slice(0, recipe.count - chosen.length).map((a) => a.id);
  notices.push(`Filled ${extra.length} cell${extra.length === 1 ? "" : "s"} from the full approved library`);
  return [...chosen, ...extra];
}

function inPool(asset: BuilderIconAsset, recipe: SelectionRecipe): boolean {
  const category = recipe.category.trim().toLowerCase();
  const categoryOk = category === "" || category === "all" || asset.category.toLowerCase() === category;
  const haystack = [asset.label, asset.base, asset.category, ...asset.tags].join(" ").toLowerCase();
  const words = (recipe.query ?? "").trim().toLowerCase().split(/\s+/);
  return categoryOk && words.every((word) => word === "" || haystack.includes(word));
}

function isAsset(asset: BuilderIconAsset | undefined): asset is BuilderIconAsset {
  return asset !== undefined;
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function ids(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.length <= max ? value : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
