// presetjson.ts — the SVG builder's editable preset JSON (2026-11-13). One
// readable document describes a whole sheet: every colour, size, margin and text
// of the artboard, grid, icons and banner, the banner words, and the icons by
// NAME (an AI or a person cannot know internal pair ids). Pasted JSON is merged
// onto the current sheet — a field left out keeps its current value — then
// clamped by the one range table. An icon that cannot be found is reported,
// never guessed (RULE 13/22). The older `{ placedIds | selection }` presets load too.
import { isRecord } from "../isrecord";
import { parseSheetConfig } from "./config";
import { RANGES } from "./ranges";
import { cleanSheetMetadata, sheetMetadataFingerprint, validateSheetMetadata } from "./metadata";
import { parseSelectionRecipe } from "./selection";
import { emptySlotFor, isEmptySlot } from "./slots";
import type { BuilderIconAsset, SelectionRecipe, SheetConfig, SheetMetadata } from "./types";

export const PRESET_FORMAT = "iconsplitter-sheet-preset";
export const PRESET_VERSION = 2;
const GROUPS = ["artboard", "grid", "icons", "banner"] as const;

/** How the JSON names one icon: its one-word Icon Name, title or file stem (or id). `null` = an empty cell. */
export type IconRef = string | { name?: string; title?: string; file?: string; id?: string } | null;

export interface PresetJsonInput {
  name: string;
  config: SheetConfig;
  placedIds: readonly string[];
  lockedIds: readonly string[];
  seed: number;
  recipe: SelectionRecipe;
  metadata: SheetMetadata | null;
  assets: readonly BuilderIconAsset[];
}

/** The word an icon is written with: Icon Name, else title, else file stem. */
export function iconWord(asset: BuilderIconAsset): string {
  return asset.name ?? asset.title ?? asset.base;
}

/** The current sheet as the editable JSON document. */
export function presetJsonOf(input: PresetJsonInput): Record<string, unknown> {
  const byId = new Map(input.assets.map((a) => [a.id, a]));
  const icons = input.placedIds.map((id) => {
    const asset = byId.get(id);
    if (isEmptySlot(id) || asset === undefined) return null;
    return { name: iconWord(asset), id };
  });
  const locked = input.lockedIds.flatMap((id) => { const a = byId.get(id); return a === undefined ? [] : [iconWord(a)]; });
  return {
    format: PRESET_FORMAT, version: PRESET_VERSION, name: input.name, config: input.config,
    icons: trimNulls(icons), lockedIcons: locked, seed: input.seed, recipe: input.recipe,
    ...(input.metadata === null ? {} : { metadata: { title: input.metadata.title, subtitle: input.metadata.subtitle, keywords: input.metadata.keywords } }),
  };
}

function trimNulls<T>(list: readonly (T | null)[]): (T | null)[] {
  let end = list.length;
  while (end > 0 && list[end - 1] === null) end--;
  return list.slice(0, end);
}

/** Every group the JSON names is laid over the current one; then the range table clamps. */
export function mergeConfig(current: SheetConfig, raw: unknown): SheetConfig {
  if (!isRecord(raw)) return current;
  const next: Record<string, unknown> = {};
  for (const g of GROUPS) next[g] = isRecord(raw[g]) ? { ...current[g], ...raw[g] } : current[g];
  return parseSheetConfig(next);
}

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

/** Finds one icon: id, then Icon Name, then title/label, then file stem — exact, case-insensitive. */
function findIcon(ref: Exclude<IconRef, null>, assets: readonly BuilderIconAsset[]): BuilderIconAsset | undefined {
  const r = typeof ref === "string" ? { name: ref, title: ref, file: ref, id: ref } : ref;
  const tries: Array<(a: BuilderIconAsset) => boolean> = [
    (a) => r.id !== undefined && a.id === r.id,
    (a) => norm(r.name) !== "" && norm(a.name) === norm(r.name),
    (a) => norm(r.title) !== "" && (norm(a.title) === norm(r.title) || norm(a.label) === norm(r.title)),
    (a) => norm(r.file) !== "" && (norm(a.base) === norm(r.file) || norm(`${a.base}${a.suffix}`) === norm(r.file)),
  ];
  for (const test of tries) {
    const hit = assets.find(test);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function refText(ref: Exclude<IconRef, null>): string {
  return typeof ref === "string" ? ref : (ref.name ?? ref.title ?? ref.file ?? ref.id ?? "?");
}

/** The placement the JSON describes: ids in cell order (empty cells kept), and what was not found. */
export function resolveIcons(refs: readonly unknown[], assets: readonly BuilderIconAsset[]): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const unresolved: string[] = [];
  for (const raw of refs) {
    const ref = asRef(raw);
    if (ref === undefined) continue;
    const hit = ref === null ? undefined : findIcon(ref, assets);
    if (ref !== null && hit === undefined) unresolved.push(refText(ref));
    ids.push(hit !== undefined && !ids.includes(hit.id) ? hit.id : emptySlotFor(ids));
  }
  return { ids, unresolved };
}

function asRef(raw: unknown): IconRef | undefined {
  if (raw === null || typeof raw === "string") return raw === "" ? null : raw;
  return isRecord(raw) ? raw as IconRef : undefined;
}

export interface AppliedPreset {
  config: SheetConfig;
  /** null = the JSON names no icons: the current placement stays. */
  placedIds: string[] | null;
  lockedIds: string[] | null;
  seed: number | null;
  recipe: SelectionRecipe | null;
  metadata: SheetMetadata | null | undefined;
  unresolved: string[];
}

/** Reads pasted (or loaded) JSON onto the current sheet; `error` says why it cannot. */
export function readPresetJson(text: string, current: SheetConfig, assets: readonly BuilderIconAsset[]): { ok: true; preset: AppliedPreset } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text) as unknown; } catch (err) { return { ok: false, error: `not valid JSON — ${(err as Error).message}` }; }
  if (!isRecord(raw)) return { ok: false, error: "the JSON must be an object { … }" };
  const placement = placementOf(raw, assets);
  return { ok: true, preset: {
    config: mergeConfig(current, raw.config), placedIds: placement.ids,
    lockedIds: locksOf(raw, assets, placement.ids), seed: seedOf(raw.seed),
    recipe: isRecord(raw.recipe) ? parseSelectionRecipe(raw.recipe) : null,
    metadata: isRecord(raw.metadata) ? metadataOf(raw.metadata) : undefined,
    unresolved: placement.unresolved,
  } };
}

/** `lockedIcons` (names) or the older `lockedIds`; only icons that are placed can be locked. */
function locksOf(raw: Record<string, unknown>, assets: readonly BuilderIconAsset[], placed: string[] | null): string[] | null {
  const ids = Array.isArray(raw.lockedIcons) ? resolveIcons(raw.lockedIcons, assets).ids
    : Array.isArray(raw.lockedIds) ? raw.lockedIds.filter((id): id is string => typeof id === "string") : null;
  if (ids === null) return null;
  return ids.filter((id) => !isEmptySlot(id) && (placed === null || placed.includes(id)));
}

function seedOf(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;
}

/** `icons` (names) wins; the older `placedIds` / `selection` (ids) still load. */
function placementOf(raw: Record<string, unknown>, assets: readonly BuilderIconAsset[]): { ids: string[] | null; unresolved: string[] } {
  if (Array.isArray(raw.icons)) return resolveIcons(raw.icons, assets);
  const legacy = Array.isArray(raw.placedIds) ? raw.placedIds : (Array.isArray(raw.selection) ? raw.selection : null);
  if (legacy === null) return { ids: null, unresolved: [] };
  return resolveIcons(legacy.filter((id) => typeof id === "string").map((id) => ({ id })), assets);
}

function metadataOf(raw: Record<string, unknown>): SheetMetadata {
  const fields = cleanSheetMetadata(raw);
  return { ...fields, state: "draft", validation: validateSheetMetadata(fields), fingerprint: sheetMetadataFingerprint(fields) };
}

const range = (k: keyof typeof RANGES) => `${RANGES[k].min}–${RANGES[k].max}`;

/** What every parameter means, for an AI asked to write a similar preset. */
export function presetSchemaText(): string {
  return [
    `"format": "${PRESET_FORMAT}", "version": ${PRESET_VERSION}, "name": a short preset name.`,
    "config.artboard: width " + range("width") + ", height " + range("height") + ", background \"#RRGGBB\", padding " + range("padding") + " (margin around everything), radius " + range("radius") + ".",
    "config.grid: columns " + range("columns") + ", rows " + range("rows") + ", gapX/gapY " + range("gapX") + " (space between cells), captions true|false, captionColor \"#RRGGBB\", captionSize " + range("captionSize") + ", captionCase \"upper\"|\"normal\".",
    "config.icons: box " + range("box") + " (cell size), strokeWidth " + range("strokeWidth") + ", color \"#RRGGBB\" (stroke colour), linecap \"round\"|\"square\".",
    "config.banner: position \"left\"|\"right\"|\"top\"|\"bottom\"|\"none\", size " + range("bannerSide") + " for left/right (width) or " + range("bannerEdge") + " for top/bottom (height), style \"solid\"|\"split\", background/accent/textColor/subtitleColor \"#RRGGBB\", title (≤ 90 chars), subtitle (≤ 140), titleSize " + range("titleSize") + ", subtitleSize " + range("subtitleSize") + ", titleFace \"sans\"|\"serif\"|\"mono\", hero true|false (a ringed icon in the banner), heroIconId (null = first icon), divider true|false (accent rule).",
    "config.banner hero style: heroScale " + range("heroScale") + " (% icon size), heroStroke " + range("heroStroke") + " (icon stroke px), ringScale " + range("ringScale") + " (% circle size), ringStroke " + range("ringStroke") + " (circle stroke px, 0 hides the circles).",
    "config.banner text placement: textPadding " + range("textPadding") + " (inset of the text from the banner edge), titleDx/titleDy and subtitleDx/subtitleDy " + range("textOffset") + " (move the text by exact pixels).",
    "icons: the grid's icons in cell order (left to right, top to bottom) — each an Icon Name from the list below (or {\"name\": …}); null leaves a cell empty. Names not in the list are reported and skipped.",
    "lockedIcons: names that keep their cell when the sheet is reshuffled. seed: a number (reshuffle seed). Any field left out keeps the sheet's current value.",
  ].join("\n");
}

/** The whole text "Copy for AI" puts on the clipboard. */
export function presetBriefForAi(current: Record<string, unknown>, assets: readonly BuilderIconAsset[]): string {
  const names = [...new Set(assets.map(iconWord))].sort((a, b) => a.localeCompare(b));
  return [
    "You write presets for an icon-sheet builder. Answer with ONE JSON object only (no prose, no code fence) in this format:",
    presetSchemaText(),
    "", "The current preset (make a similar one — change colours, layout, text and icons as asked):",
    JSON.stringify(current, null, 2),
    "", `Available Icon Names (${names.length}) — use only these in "icons":`,
    names.join(", "),
  ].join("\n");
}
