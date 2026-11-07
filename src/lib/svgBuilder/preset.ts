// preset.ts — validated builder preset files. A preset names stable approved
// asset ids and their scan fingerprints; missing ids are pruned and reported,
// never replaced with a guess (RULE 13/22).
import { isRecord } from "../isrecord";
import { copyConfig, parseSheetConfig } from "./config";
import { cleanSheetMetadata, sheetMetadataFingerprint, validateSheetMetadata } from "./metadata";
import { parseSelectionRecipe } from "./selection";
import type { SheetMetadata, SheetPreset, SourceFingerprint } from "./types";

export function serializeSheetPreset(raw: SheetPreset): SheetPreset {
  return {
    v: 1, config: copyConfig(parseSheetConfig(raw.config)),
    placedIds: [...new Set(raw.placedIds)], lockedIds: [...new Set(raw.lockedIds)],
    seed: Number.isFinite(raw.seed) ? Math.floor(raw.seed) : 2841,
    recipe: parseSelectionRecipe(raw.recipe), metadata: parseMetadata(raw.metadata),
    sources: raw.sources.map(cleanSource),
  };
}

export function stringifySheetPreset(preset: SheetPreset): string {
  return JSON.stringify(serializeSheetPreset(preset), null, 2);
}

export function parseSheetPreset(
  raw: unknown, knownIds?: ReadonlySet<string>,
): { preset: SheetPreset; droppedIds: string[] } {
  const value: unknown = typeof raw === "string" ? tryJson(raw) : raw;
  const source = isRecord(value) ? value : {};
  const placedIds = ids(source.placedIds);
  const lockedIds = ids(source.lockedIds);
  const dropped = knownIds === undefined ? [] : placedIds.filter((id) => !knownIds.has(id));
  const kept = knownIds === undefined ? placedIds : placedIds.filter((id) => knownIds.has(id));
  const preset: SheetPreset = {
    v: 1, config: parseSheetConfig(source.config), placedIds: kept,
    lockedIds: knownIds === undefined ? lockedIds : lockedIds.filter((id) => knownIds.has(id)),
    seed: seedOf(source.seed), recipe: parseSelectionRecipe(source.recipe),
    metadata: parseMetadata(source.metadata), sources: sourcesOf(source.sources, knownIds),
  };
  return { preset, droppedIds: [...new Set(dropped)] };
}

export function presetFileName(title: string): string {
  const clean = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${clean === "" ? "svg-builder" : clean}.preset.json`;
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

function sourcesOf(raw: unknown, knownIds?: ReadonlySet<string>): SourceFingerprint[] {
  if (!Array.isArray(raw)) return [];
  const sources = raw.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : "", fingerprint: typeof item.fingerprint === "string" ? item.fingerprint : "",
  })).filter((s) => s.id !== "");
  return knownIds === undefined ? sources : sources.filter((s) => knownIds.has(s.id));
}

function ids(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

function seedOf(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2841;
}
