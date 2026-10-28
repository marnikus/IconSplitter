// stockbadges.ts — unique per-stock named row badges + uploaded/pending markers.
// Automatically creates a distinct named badge per stock preset and assigns it
// to an exported item as soon as a file is sent to that stock.

import {
  ROW_BADGE_MAX, badgesOf, normalizeName, setBadgeOn,
  type RowBadge, type RowBadgeState,
} from "../upload/rowbadge";
import type {
  StockFtpPreset, StockHistoryMap, StockSiteStatus, UploadFormatKey,
} from "./types";

export const STOCK_BADGE_PREFIX = "stock:";

const BUILTIN_STOCK_COLORS: Readonly<Record<string, string>> = {
  shutterstock: "#ff4b4b",
  "adobe-stock": "#3898ff",
};

const CUSTOM_STOCK_PALETTE = [
  "#29c77f", "#f5a623", "#a259ff", "#19d4c6",
  "#ff7a3d", "#e85db8", "#7bd335", "#6c8cff",
] as const;

export type PerStockMarkerState = "uploaded" | "partial" | "failed" | "interrupted" | "pending";

export interface PerStockMarker {
  presetId: string;
  name: string;
  badgeId: string;
  color: string;
  state: PerStockMarkerState;
  formats: UploadFormatKey[];
  uploadedAt: string | null;
  error: string | null;
}

export function stockBadgeIdOf(presetId: string): string {
  return `${STOCK_BADGE_PREFIX}${presetId}`;
}

function hashFallbackColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  const r = 64 + (h & 0xbf);
  const g = 64 + ((h >>> 8) & 0xbf);
  const b = 64 + ((h >>> 16) & 0xbf);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function stockBadgeColorOf(
  preset: Pick<StockFtpPreset, "id" | "template">,
  usedColors: ReadonlySet<string> = new Set(),
): string {
  const builtin = BUILTIN_STOCK_COLORS[preset.template] ?? BUILTIN_STOCK_COLORS[preset.id];
  if (builtin && !usedColors.has(builtin)) return builtin;
  for (const candidate of CUSTOM_STOCK_PALETTE) {
    if (!usedColors.has(candidate)) return candidate;
  }
  return builtin ?? hashFallbackColor(preset.id);
}

function uniqueBadgeNameForStock(
  rawName: string,
  catalog: readonly RowBadge[],
  badgeId: string,
): string {
  const base = normalizeName(rawName) || "Stock";
  const taken = (candidate: string) =>
    catalog.some((b) => b.id !== badgeId && b.name.toLowerCase() === candidate.toLowerCase());
  if (!taken(base)) return base;
  const suffixed = normalizeName(`${base} (Stock)`);
  if (!taken(suffixed)) return suffixed;
  let n = 2;
  while (taken(normalizeName(`${base} ${n}`))) n += 1;
  return normalizeName(`${base} ${n}`);
}

function upsertOneStockBadge(
  catalog: RowBadge[],
  preset: StockFtpPreset,
  usedColors: Set<string>,
): boolean {
  const id = stockBadgeIdOf(preset.id);
  const desiredName = uniqueBadgeNameForStock(preset.name, catalog, id);
  const idx = catalog.findIndex((b) => b.id === id);
  if (idx >= 0) {
    usedColors.add(catalog[idx].color);
    if (catalog[idx].name === desiredName) return false;
    catalog[idx] = { ...catalog[idx], name: desiredName };
    return true;
  }
  if (catalog.length >= ROW_BADGE_MAX) return false;
  const color = stockBadgeColorOf(preset, usedColors);
  usedColors.add(color);
  catalog.push({ id, name: desiredName, color });
  return true;
}

export function ensureStockBadges(
  state: RowBadgeState,
  presets: readonly StockFtpPreset[],
): RowBadgeState {
  const nextCatalog = [...state.catalog];
  const usedColors = new Set(nextCatalog.map((b) => b.color.toLowerCase()));
  let changed = false;
  for (const preset of presets) {
    if (upsertOneStockBadge(nextCatalog, preset, usedColors)) changed = true;
  }
  return changed ? { ...state, catalog: nextCatalog } : state;
}

export function assignStockBadgeOnSend(
  state: RowBadgeState,
  preset: StockFtpPreset,
  itemId: string,
): RowBadgeState {
  const ensured = ensureStockBadges(state, [preset]);
  return setBadgeOn(ensured, itemId, stockBadgeIdOf(preset.id), true);
}

function resolveMarkerState(
  entry: StockSiteStatus | undefined,
  hasBadge: boolean,
): PerStockMarkerState {
  if (entry) return entry.status;
  return hasBadge ? "uploaded" : "pending";
}

export function stockMarkerStateForItem(
  itemId: string,
  presetId: string,
  history: StockHistoryMap,
  rowBadges: RowBadgeState,
): PerStockMarkerState {
  const entry = history[itemId]?.[presetId];
  const hasBadge = badgesOf(rowBadges, itemId).includes(stockBadgeIdOf(presetId));
  return resolveMarkerState(entry, hasBadge);
}

export function perStockMarkersOf(
  itemId: string,
  presets: readonly StockFtpPreset[],
  history: StockHistoryMap,
  rowBadges: RowBadgeState,
): PerStockMarker[] {
  const assigned = new Set(badgesOf(rowBadges, itemId));
  return presets.map((preset) => {
    const badgeId = stockBadgeIdOf(preset.id);
    const catalogBadge = rowBadges.catalog.find((b) => b.id === badgeId);
    const entry = history[itemId]?.[preset.id];
    return {
      presetId: preset.id,
      name: preset.name,
      badgeId,
      color: catalogBadge?.color ?? stockBadgeColorOf(preset),
      state: resolveMarkerState(entry, assigned.has(badgeId)),
      formats: entry?.formats ?? [],
      uploadedAt: entry?.uploadedAt ?? null,
      error: entry?.error ?? null,
    };
  });
}
