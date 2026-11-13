// preset.ts — validated builder preset files ("Settings, selection and seed").
// A preset names stable approved asset ids; ids that are no longer approved are
// pruned and reported, never replaced with a guess (RULE 13/22). The reference
// shape `{version, generator, created, config, selection, seed}` is read too.
import { isRecord } from "../isrecord";
import { copyConfig, parseSheetConfig } from "./config";
import { cleanSheetMetadata, sheetMetadataFingerprint, validateSheetMetadata } from "./metadata";
import { DEFAULT_SEED, parseSelectionRecipe } from "./selection";
import type { SheetMetadata, SheetPreset, SourceFingerprint } from "./types";

export const PRESET_GENERATOR = "Icon Splitter SVG builder";

export function serializeSheetPreset(raw: SheetPreset): SheetPreset {
  const placedIds = [...new Set(raw.placedIds)];
  return {
    v: 1, version: 1, generator: PRESET_GENERATOR, created: raw.created ?? new Date().toISOString(),
    config: copyConfig(parseSheetConfig(raw.config)), selection: placedIds, placedIds,
    lockedIds: [...new Set(raw.lockedIds)], seed: seedOf(raw.seed),
    recipe: parseSelectionRecipe(raw.recipe), metadata: parseMetadata(raw.metadata), sources: raw.sources.map(cleanSource),
  };
}

export function stringifySheetPreset(preset: SheetPreset): string {
  return JSON.stringify(serializeSheetPreset(preset), null, 2);
}

export function parseSheetPreset(raw: unknown, knownIds?: ReadonlySet<string>): { preset: SheetPreset; droppedIds: string[] } {
  const value: unknown = typeof raw === "string" ? tryJson(raw) : raw;
  const source = isRecord(value) ? value : {};
  const placed = [...new Set(ids(source.placedIds ?? source.selection))];
  const known = (id: string) => knownIds === undefined || knownIds.has(id);
  const kept = placed.filter(known);
  const preset: SheetPreset = {
    v: 1, config: parseSheetConfig(source.config), placedIds: kept,
    lockedIds: ids(source.lockedIds).filter((id) => known(id) && kept.includes(id)),
    seed: seedOf(source.seed), recipe: parseSelectionRecipe(source.recipe),
    metadata: parseMetadata(source.metadata), sources: sourcesOf(source.sources).filter((s) => known(s.id)),
  };
  return { preset, droppedIds: placed.filter((id) => !known(id)) };
}

/** Reference slug: title lower-cased, non-alphanumerics → "-", ≤ 64 chars, default "icon-sheet". */
export function sheetSlug(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
  return slug === "" ? "icon-sheet" : slug;
}

export function presetFileName(title: string): string {
  return `${sheetSlug(title)}-preset.json`;
}

function tryJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function parseMetadata(raw: unknown): SheetMetadata | null {
  if (!isRecord(raw)) return null;
  const fields = cleanSheetMetadata(raw);
  return { ...fields, state: raw.state === "accepted" ? "accepted" : "draft",
    validation: validateSheetMetadata(fields), fingerprint: sheetMetadataFingerprint(fields) };
}

function cleanSource(raw: SourceFingerprint): SourceFingerprint {
  return { id: String(raw.id), fingerprint: String(raw.fingerprint) };
}

function sourcesOf(raw: unknown): SourceFingerprint[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : "", fingerprint: typeof item.fingerprint === "string" ? item.fingerprint : "",
  })).filter((s) => s.id !== "");
}

function ids(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

function seedOf(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_SEED;
}
