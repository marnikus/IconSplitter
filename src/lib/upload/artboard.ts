// artboard.ts — the export artboard of the "SVG to upload" settings domain
// (RULE 3/13/18): the three modes, the offered presets, the px limits, and the
// clamp that turns any stored or typed value into a valid artboard. Split out
// of settings.ts on 2026-10-08 so that file stays one screen of paint and
// number fields; settings.ts re-exports this surface, so importers never moved.

import { isRecord } from "../isrecord";
import type { FitTarget } from "./geom";

/**
 * The export artboard's size. `content` hugs the artwork (the padded fit, the
 * original behaviour); `preset`/`custom` pin an EXACT size in px, so the
 * artwork is scaled into it — `custom` is also how a non-square aspect ratio is
 * chosen (width : height).
 */
export interface Artboard {
  mode: "content" | "preset" | "custom";
  /** Square edge in px for `preset` mode — always one of ARTBOARD_PRESETS. */
  size: number;
  /** Exact px for `custom` mode; their ratio is the aspect ratio. */
  width: number;
  height: number;
}

/** The popular square icon sizes a stock site asks for. */
export const ARTBOARD_PRESETS = [256, 512, 1024, 2048, 4096];
export const ARTBOARD_MIN = 16;
export const ARTBOARD_MAX = 8192;
/** The canvas/JPEG ceiling shared with MP_MAX (64 MP): a pinned artboard may not exceed it. */
export const ARTBOARD_MAX_PIXELS = 64 * 1e6;
export const CONTENT_ARTBOARD: Artboard = { mode: "content", size: 512, width: 512, height: 512 };

/** A stored/patch artboard → a valid one; anything unreadable becomes `content`. */
export function clampArtboard(value: unknown): Artboard {
  if (!isRecord(value)) return { ...CONTENT_ARTBOARD };
  const mode = value.mode;
  if (mode !== "content" && mode !== "preset" && mode !== "custom") return { ...CONTENT_ARTBOARD };
  if (mode === "content") return { ...CONTENT_ARTBOARD, mode: "content" };
  if (mode === "preset") return { mode, size: nearestPreset(value.size), width: 512, height: 512 };
  const fitted = fitIntoCeiling(clampEdge(value.width), clampEdge(value.height));
  return { mode, size: 512, width: fitted.width, height: fitted.height };
}

/** The exact px size an artboard pins, or null when it hugs the content. */
export function artboardSize(a: Artboard): { width: number; height: number } | null {
  if (a.mode === "preset") return { width: a.size, height: a.size };
  if (a.mode === "custom") return { width: a.width, height: a.height };
  return null;
}

/**
 * What the export fits into (I-62): a pinned artboard's px win; otherwise the
 * megapixel target when "Scale to N MP" is on (`megapixels` null = off); else
 * nothing — the artboard hugs the content.
 */
export function artboardTarget(a: Artboard, megapixels: number | null): FitTarget | null {
  const pinned = artboardSize(a);
  if (pinned !== null) return pinned;
  return megapixels === null ? null : { megapixels };
}

/** The megapixel target that really applies: null when the box is off or a pinned size decides. */
export function megapixelTargetOf(a: Artboard, scaleTo: boolean, megapixels: number): number | null {
  return scaleTo && artboardSize(a) === null ? megapixels : null;
}

export function artboardsEqual(a: Artboard, b: Artboard): boolean {
  return a.mode === b.mode && a.size === b.size && a.width === b.width && a.height === b.height;
}

function nearestPreset(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return CONTENT_ARTBOARD.size;
  let best = ARTBOARD_PRESETS[0];
  for (const preset of ARTBOARD_PRESETS) {
    if (Math.abs(preset - n) < Math.abs(best - n)) best = preset;
  }
  return best;
}

function clampEdge(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return CONTENT_ARTBOARD.width;
  return Math.round(Math.min(ARTBOARD_MAX, Math.max(ARTBOARD_MIN, n)));
}

/** Over the pixel ceiling both edges shrink together — the aspect ratio survives. */
function fitIntoCeiling(width: number, height: number): { width: number; height: number } {
  const area = width * height;
  if (area <= ARTBOARD_MAX_PIXELS) return { width, height };
  const k = Math.sqrt(ARTBOARD_MAX_PIXELS / area);
  return { width: Math.max(ARTBOARD_MIN, Math.round(width * k)), height: Math.max(ARTBOARD_MIN, Math.round(height * k)) };
}
