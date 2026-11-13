// usage.ts — how often an icon went into an exported artboard (2026-11-13).
// One `<svg>.usage.json` beside the approved SVG, next to its `<svg>.index.json`
// (never a .png / .svg / .svg.json name, so no scanner mistakes it for a pair
// file). The count only grows when an artboard holding the icon is EXPORTED;
// icons on artboards not exported yet are "pending" and live in the app only.
import { isRecord } from "../isrecord";

export const USAGE_HISTORY_MAX = 50;

export interface UsageRecord {
  v: 1;
  id: string;
  svgPath: string;
  /** Exported artboards that held this icon. */
  used: number;
  /** When it was last exported, ISO; null before the first export. */
  last: string | null;
  /** The newest exports first: which artboard, when (at most USAGE_HISTORY_MAX). */
  history: Array<{ at: string; artboard: string }>;
}

export function usagePathOf(svgPath: string): string {
  return `${svgPath}.usage.json`;
}

export function emptyUsage(id: string, svgPath: string): UsageRecord {
  return { v: 1, id, svgPath, used: 0, last: null, history: [] };
}

/** Validated field by field (RULE 13); a foreign or damaged file is no record. */
export function parseUsageRecord(raw: unknown): UsageRecord | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || typeof raw.svgPath !== "string") return null;
  const used = typeof raw.used === "number" && Number.isFinite(raw.used) && raw.used >= 0 ? Math.floor(raw.used) : 0;
  const history = Array.isArray(raw.history)
    ? raw.history.filter(isRecord).flatMap((h) => (typeof h.at === "string" && typeof h.artboard === "string" ? [{ at: h.at, artboard: h.artboard }] : []))
    : [];
  return { v: 1, id: raw.id, svgPath: raw.svgPath, used, last: typeof raw.last === "string" ? raw.last : null, history: history.slice(0, USAGE_HISTORY_MAX) };
}

/** One more exported artboard holding the icon. */
export function bumpUsage(record: UsageRecord, artboard: string, at: string): UsageRecord {
  return { ...record, used: record.used + 1, last: at, history: [{ at, artboard }, ...record.history].slice(0, USAGE_HISTORY_MAX) };
}

export function serializeUsageRecord(record: UsageRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
