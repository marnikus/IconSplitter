// prefsstore.ts — display-only builder preferences, validated on read.
import { isRecord } from "../lib/isrecord";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_PREFS_KEY = "iconSplitter.svgBuilder.prefs.v1";

export type BuilderLayoutChoice = "editorial" | "masthead" | "plain" | "custom";

export interface BuilderPrefs {
  /** Manual zoom; used only while `fit` is false. */
  zoom: number;
  /** Fit the artboard into the stage (reference default, recomputed on resize). */
  fit: boolean;
  providerOpen: boolean;
  /** Which layout preset the config came from; any manual edit makes it "custom". */
  layout: BuilderLayoutChoice;
}

export const DEFAULT_BUILDER_PREFS: BuilderPrefs = { zoom: 1, fit: true, providerOpen: true, layout: "editorial" };
const LAYOUTS: readonly BuilderLayoutChoice[] = ["editorial", "masthead", "plain", "custom"];

export function parseBuilderPrefs(raw: unknown): BuilderPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_BUILDER_PREFS };
  return {
    zoom: num(raw.zoom, DEFAULT_BUILDER_PREFS.zoom, 0.1, 2),
    fit: raw.fit !== false,
    providerOpen: raw.providerOpen !== false,
    layout: LAYOUTS.includes(raw.layout as BuilderLayoutChoice) ? raw.layout as BuilderLayoutChoice : "custom",
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
