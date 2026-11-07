// prefsstore.ts — display-only builder preferences, validated on read.
import { isRecord } from "../lib/isrecord";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_PREFS_KEY = "iconSplitter.svgBuilder.prefs.v1";

export interface BuilderPrefs {
  zoom: number;
  providerOpen: boolean;
  inspectorOpen: boolean;
  libraryThumb: number;
}

export const DEFAULT_BUILDER_PREFS: BuilderPrefs = {
  zoom: 1, providerOpen: true, inspectorOpen: true, libraryThumb: 56,
};

export function parseBuilderPrefs(raw: unknown): BuilderPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_BUILDER_PREFS };
  return {
    zoom: num(raw.zoom, DEFAULT_BUILDER_PREFS.zoom, 0.25, 3),
    providerOpen: raw.providerOpen !== false,
    inspectorOpen: raw.inspectorOpen !== false,
    libraryThumb: num(raw.libraryThumb, DEFAULT_BUILDER_PREFS.libraryThumb, 32, 160),
  };
}

export function loadBuilderPrefs(): BuilderPrefs {
  return parseBuilderPrefs(readObject(BUILDER_PREFS_KEY));
}

export function saveBuilderPrefs(prefs: BuilderPrefs): void {
  writeKey(BUILDER_PREFS_KEY, JSON.stringify(parseBuilderPrefs(prefs)));
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function readObject(key: string): unknown {
  const text = readKey(key);
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
