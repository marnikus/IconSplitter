// prefsstore.ts — display-only builder preferences, validated on read.
import { isRecord } from "../lib/isrecord";
import { clampZoom } from "../lib/zoom";
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
  /** The metadata prompt + Gemini widget: folded or open, and a user-dragged height (null = natural). */
  metaOpen: boolean;
  metaHeight: number | null;
  /** The small % closeness numbers on the artboard. */
  showScores: boolean;
  /** Their opacity in %, 1–100. */
  scoreOpacity: number;
  /** Height of the saved-template pictures, the shared 48–800 px zoom (2026-11-13). */
  templateZoom: number;
  /** The small "used N times" index on each icon of the artboard (2026-11-13). */
  showUsage: boolean;
}

export const DEFAULT_BUILDER_PREFS: BuilderPrefs = { zoom: 1, fit: true, providerOpen: true, layout: "editorial", metaOpen: true, metaHeight: null, showScores: true, scoreOpacity: 100, templateZoom: 140, showUsage: true };
export const META_HEIGHT = { min: 160, max: 1200 } as const;
const LAYOUTS: readonly BuilderLayoutChoice[] = ["editorial", "masthead", "plain", "custom"];

export function parseBuilderPrefs(raw: unknown): BuilderPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_BUILDER_PREFS };
  return {
    zoom: num(raw.zoom, DEFAULT_BUILDER_PREFS.zoom, 0.1, 2),
    fit: raw.fit !== false,
    providerOpen: raw.providerOpen !== false,
    layout: LAYOUTS.includes(raw.layout as BuilderLayoutChoice) ? raw.layout as BuilderLayoutChoice : "custom",
    metaOpen: raw.metaOpen !== false,
    showScores: raw.showScores !== false,
    scoreOpacity: Math.round(num(raw.scoreOpacity, 100, 1, 100)),
    templateZoom: typeof raw.templateZoom === "number" ? clampZoom(raw.templateZoom) : DEFAULT_BUILDER_PREFS.templateZoom,
    showUsage: raw.showUsage !== false,
    metaHeight: typeof raw.metaHeight === "number" ? num(raw.metaHeight, 0, META_HEIGHT.min, META_HEIGHT.max) || null : null,
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
