// cutsettings.ts — "Cutter algo" settings (2026-11-06): how long a tail may be
// (the icon's own px — viewBox units), the highlight colour, the highlight
// padding (screen px, so it stays visible on a small thumbnail), and auto-cut
// (cut at once) versus review-and-approve. Stored on this device, validated on
// read (RULE 13).

import { useSyncExternalStore } from "react";
import { normalizeHex } from "../../lib/svgbackground";

export const CUT_SETTINGS_KEY = "iconSplitter.svg.tailCut.v1";

export interface CutSettings {
  tolerancePx: number;
  color: string;
  paddingPx: number;
  auto: boolean;
}

export const CUT_DEFAULTS: CutSettings = { tolerancePx: 10, color: "#ff5a5a", paddingPx: 6, auto: false };
export const TOLERANCE_MIN = 0.5;
export const TOLERANCE_MAX = 500;
export const PADDING_MAX = 60;

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

export function parseCutSettings(raw: unknown): CutSettings {
  const v = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    tolerancePx: num(v.tolerancePx, TOLERANCE_MIN, TOLERANCE_MAX, CUT_DEFAULTS.tolerancePx),
    color: typeof v.color === "string" ? (normalizeHex(v.color) ?? CUT_DEFAULTS.color) : CUT_DEFAULTS.color,
    paddingPx: Math.round(num(v.paddingPx, 0, PADDING_MAX, CUT_DEFAULTS.paddingPx)),
    auto: typeof v.auto === "boolean" ? v.auto : CUT_DEFAULTS.auto,
  };
}

let current: CutSettings | null = null;
const listeners = new Set<() => void>();

export function getCutSettings(): CutSettings {
  if (current === null) {
    try { current = parseCutSettings(JSON.parse(localStorage.getItem(CUT_SETTINGS_KEY) ?? "{}")); } catch { current = CUT_DEFAULTS; }
  }
  return current;
}

export function setCutSettings(patch: Partial<CutSettings>): void {
  current = parseCutSettings({ ...getCutSettings(), ...patch });
  try { localStorage.setItem(CUT_SETTINGS_KEY, JSON.stringify(current)); } catch { /* kept for this session */ }
  for (const fn of [...listeners]) fn();
}

export function forgetCutSettings(): void { current = null; }

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useCutSettings(): CutSettings {
  return useSyncExternalStore(subscribe, getCutSettings);
}
