// assets.ts — turns approved discovery rows into the builder's read-only asset
// catalogue. Categories and tags come from the user's own folder tree and pair
// names; there is no bundled icon set and no global registry file.
import { compareNames } from "../scan";
import type { BuilderIconAsset, BuilderProfile, BuilderRowLike } from "./types";

const NOISE = new Set(["export", "svg-builder", "_split_output", "split_01", "split_02", "split_03", "split_04"]);

export function assetFromRow(row: BuilderRowLike): BuilderIconAsset {
  const parts = pathParts(row.dirPath);
  const category = parts.find(isMeaningful) ?? "Root";
  return {
    id: row.id, base: row.base, suffix: row.suffix, label: labelOf(row.base, row.suffix),
    category, tags: tagsOf(row, parts, category), svgPath: row.svgPath, svgName: row.svgName,
    version: row.version, fingerprint: row.fingerprint, metaPath: row.metaPath, approved: true,
  };
}

export function assetsFromRows(rows: readonly BuilderRowLike[]): BuilderIconAsset[] {
  return rows.map(assetFromRow).sort((a, b) => compareNames(a.label, b.label) || compareNames(a.id, b.id));
}

export function categoriesOf(assets: readonly BuilderIconAsset[]): string[] {
  const names = [...new Set(assets.map((a) => a.category))].sort(compareNames);
  return ["All", ...names];
}

export function profilesOf(assets: readonly BuilderIconAsset[]): BuilderProfile[] {
  const all: BuilderProfile = { id: "all", label: "All approved assets", tags: [] };
  const byCategory = categoriesOf(assets).slice(1).map((category) => ({
    id: category, label: `${category} profile`, tags: [category.toLowerCase()],
  }));
  return [all, ...byCategory];
}

export function filterAssets(
  assets: readonly BuilderIconAsset[], query: string, category: string,
): BuilderIconAsset[] {
  const needle = query.trim().toLowerCase();
  return assets.filter((asset) => categoryMatches(asset, category) && queryMatches(asset, needle));
}

function categoryMatches(asset: BuilderIconAsset, category: string): boolean {
  const wanted = category.trim().toLowerCase();
  return wanted === "" || wanted === "all" || wanted === asset.category.toLowerCase();
}

function queryMatches(asset: BuilderIconAsset, needle: string): boolean {
  if (needle === "") return true;
  const haystack = [asset.label, asset.base, asset.suffix, asset.category, ...asset.tags].join(" ").toLowerCase();
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
  return [...new Set(["approved", ...words])].slice(0, 16);
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
