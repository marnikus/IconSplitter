// iconstyles.ts — an icon's STYLE in the builder (2026-11-23). The base style is
// the row's own line-stroke SVG; any other is a style row registered in
// Generate SVG (`<base id>~colored_wiggle`, lib/svgstyles.ts), listed as its own
// icon. Which styles may be in sheets is a multi-choice filter (lib/multifilter):
// "all", one style, or several. Pure.
import { anyOf, type Multi } from "../multifilter";
import { STYLE_ID_SEP } from "../svgstyles";
import { isEmptySlot } from "./slots";
import type { BuilderIconAsset } from "./types";

export const BASE_STYLE = "base";
export const ALL_STYLES = "all";

const STYLE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The style an icon id names: what follows `~`, else the base line stroke. */
export function styleOfId(id: string): string {
  const at = id.indexOf(STYLE_ID_SEP);
  return at < 0 ? BASE_STYLE : id.slice(at + STYLE_ID_SEP.length);
}

export const styleOfAsset = (asset: Pick<BuilderIconAsset, "id">): string => styleOfId(asset.id);

/** A real icon of a registered style (never an empty cell, never a base icon). */
export const isStyledIcon = (id: string): boolean => !isEmptySlot(id) && styleOfId(id) !== BASE_STYLE;

/** "Line stroke", "Colored wiggle". */
export function styleLabel(style: string): string {
  if (style === BASE_STYLE) return "Line stroke";
  const words = style.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const picked = (want: Multi<string>): string[] => (typeof want === "string" ? (want === ALL_STYLES ? [] : [want]) : [...want]);

/** The dropdown's options: All styles, the base first, the library's other styles by name — and any picked one it lost (so it can be unchecked). */
export function styleOptions(assets: readonly Pick<BuilderIconAsset, "id">[], want: Multi<string>): Array<[string, string]> {
  const found = new Set(assets.map(styleOfAsset));
  for (const s of picked(want)) found.add(s);
  const named = [...found].filter((s) => s !== BASE_STYLE).sort((x, y) => x.localeCompare(y));
  const styles = found.has(BASE_STYLE) ? [BASE_STYLE, ...named] : named;
  return [[ALL_STYLES, "All styles"], ...styles.map((s): [string, string] => [s, styleLabel(s)])];
}

/** The icons the filter allows (the same list when everything is allowed). */
export function allowedAssets<T extends Pick<BuilderIconAsset, "id">>(assets: readonly T[], want: Multi<string>): readonly T[] {
  if (picked(want).length === 0) return assets;
  return assets.filter((a) => anyOf(want, ALL_STYLES, (s) => styleOfAsset(a) === s));
}

/** Icons on a sheet whose style the filter does not allow (empty cells never; the style is in the id, listed or not). */
export function offStyleIds(ids: readonly string[], want: Multi<string>): string[] {
  if (picked(want).length === 0) return [];
  return ids.filter((id) => !isEmptySlot(id) && !anyOf(want, ALL_STYLES, (s) => styleOfId(id) === s));
}

/** A stored filter, field by field: style names only; one as itself; nothing (or only "all") = all (RULE 13). */
export function parseStyleFilter(raw: unknown): Multi<string> {
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const kept = [...new Set(list.filter((v): v is string => typeof v === "string" && v !== ALL_STYLES && STYLE_NAME.test(v)))];
  return kept.length === 0 ? ALL_STYLES : kept.length === 1 ? kept[0] : kept;
}
