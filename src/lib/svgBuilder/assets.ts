// assets.ts — turns approved discovery rows into the builder's read-only asset
// catalogue. Categories and tags come from the user's own folder tree and pair
// names; there is no bundled icon set and no global registry file.
import { compareNames } from "../scan";
import type { BuilderIconAsset, BuilderProfile, BuilderRowLike, ExportMeta } from "./types";

const NOISE = new Set(["export", "svg-builder", "_split_output", "split_01", "split_02", "split_03", "split_04"]);

/** Stock tags every exported icon carries; like "approved", they never form a profile. */
const GENERIC_TAGS = new Set(["icon", "icons", "pictogram", "vector", "stroke", "line", "editable", "web", "approved", "symbol", "sign", "outline"]);
const MAX_TAG_PROFILES = 24;

/**
 * One approved row → one asset. With export metadata the title IS the name, and the
 * title, description and tags all become searchable, scorable tags; without it the
 * name and tags come from the file name and folders.
 */
export function assetFromRow(row: BuilderRowLike, meta?: ExportMeta): BuilderIconAsset {
  const parts = pathParts(row.dirPath);
  const category = parts.find(isMeaningful) ?? "Root";
  const title = meta?.title.trim() ?? "";
  const base: BuilderIconAsset = {
    id: row.id, base: row.base, suffix: row.suffix, label: title !== "" ? title : labelOf(row.base, row.suffix),
    category, tags: tagsOf(row, parts, category), svgPath: row.svgPath, svgName: row.svgName,
    version: row.version, fingerprint: row.fingerprint, metaPath: row.metaPath, approved: true,
    ...(typeof row.aiPath === "string" && row.aiPath !== "" ? { aiPath: row.aiPath } : {}),
  };
  return meta === undefined || title === "" ? base : withMeta(base, meta, title);
}

function withMeta(asset: BuilderIconAsset, meta: ExportMeta, title: string): BuilderIconAsset {
  const keywords = meta.tags.map((t) => t.trim()).filter((t) => t !== "");
  const words = [title, meta.description, ...keywords].flatMap(tokens);
  const phrases = keywords.map((k) => k.toLowerCase());
  return { ...asset, title, description: meta.description.trim(), keywords,
    tags: [...new Set([...asset.tags, ...phrases, ...words])], ...(meta.name ? { name: meta.name } : {}) };
}

/** The caption under an icon: its one-word Icon Name, else its label (title or file name). */
export function captionOf(asset: BuilderIconAsset): string {
  return asset.name !== undefined && asset.name !== "" ? asset.name : asset.label;
}

export function assetsFromRows(rows: readonly BuilderRowLike[], metaById?: ReadonlyMap<string, ExportMeta>): BuilderIconAsset[] {
  return rows.map((row) => assetFromRow(row, metaById?.get(row.id)))
    .sort((a, b) => compareNames(a.label, b.label) || compareNames(a.id, b.id));
}

export function categoriesOf(assets: readonly BuilderIconAsset[]): string[] {
  const names = [...new Set(assets.map((a) => a.category))].sort(compareNames);
  return ["All", ...names];
}

/**
 * Metadata profiles = one per category plus "All approved". A profile's tags are
 * the category's own tokens + "approved" (every asset carries it, like the
 * reference's "outline"), tokenised exactly like asset tags so a multi-word
 * category still matches (FIXES B3).
 */
export function profilesOf(assets: readonly BuilderIconAsset[]): BuilderProfile[] {
  const byCategory = categoriesOf(assets).slice(1).map((category) => ({
    id: category, label: category, tags: [...new Set([...tokens(category), "approved"])],
  }));
  return [...byCategory, ...tagProfiles(assets), { id: "all", label: "All approved assets", tags: ["approved"] }];
}

/** Export-metadata tags shared by ≥ 2 icons become "#tag" profiles (most frequent first). */
function tagProfiles(assets: readonly BuilderIconAsset[]): BuilderProfile[] {
  const counts = new Map<string, number>();
  for (const a of assets) for (const k of new Set((a.keywords ?? []).map((t) => t.toLowerCase()))) {
    if (!GENERIC_TAGS.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || compareNames(a[0], b[0]))
    .slice(0, MAX_TAG_PROFILES).map(([k, n]) => ({ id: `#${k}`, label: `#${k} (${n})`, tags: [k, "approved"] }));
}

/** Score = shared tags ÷ profile tags (not Jaccard), 0–1. */
export function scoreOf(asset: BuilderIconAsset, profile: BuilderProfile | undefined): number {
  if (profile === undefined || profile.tags.length === 0) return 0;
  const have = new Set(asset.tags.map((t) => t.toLowerCase()));
  return profile.tags.filter((t) => have.has(t)).length / profile.tags.length;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

export function filterAssets(
  assets: readonly BuilderIconAsset[], query: string, category: string,
): BuilderIconAsset[] {
  const needle = query.trim().replace(/^#+/, "").toLowerCase();
  return assets.filter((asset) => categoryMatches(asset, category) && queryMatches(asset, needle));
}

function categoryMatches(asset: BuilderIconAsset, category: string): boolean {
  const wanted = category.trim().toLowerCase();
  return wanted === "" || wanted === "all" || wanted === asset.category.toLowerCase();
}

function queryMatches(asset: BuilderIconAsset, needle: string): boolean {
  if (needle === "") return true;
  const haystack = [asset.label, asset.base, asset.suffix, asset.category, asset.description ?? "", ...asset.tags].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function labelOf(base: string, suffix: string): string {
  const words = `${base} ${suffix}`.replace(/[_-]+/g, " ").replace(/\bAI\b/gi, "").trim().replace(/\s+/g, " ");
  return words === "" ? "Approved icon" : words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function tagsOf(row: BuilderRowLike, parts: readonly string[], category: string): string[] {
  const words = [...parts, category, row.base, row.suffix]
    .flatMap((part) => part.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 1 && !NOISE.has(token));
  return [...new Set(["approved", ...words])].slice(0, 32);
}

function pathParts(dirPath: string): string[] {
  return dirPath.split(/[\\/]+/).filter((part) => part !== "" && !isRunStamp(part) && !/^split_\d+$/i.test(part));
}

function isMeaningful(part: string): boolean {
  return !NOISE.has(part.toLowerCase()) && !/^\d{4}-\d{2}(-\d{2})?/.test(part);
}

function isRunStamp(part: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(part);
}
