import { readDestinations } from "./destinations";
import { isRecord } from "../isrecord";
import type { FormatSelection } from "./types";
export interface StockPreset { name: string; formats: FormatSelection }
export interface StockPreferences { formats: FormatSelection; zoom: number; presets: StockPreset[]; destinations: string[] }
export const DEFAULT_STOCK_PREFS: StockPreferences = { formats: { raster: true, svg: false, eps: true, zip: false }, zoom: 90, presets: [], destinations: ["shutterstock"] };
export function parseStockPreferences(raw: unknown): StockPreferences {
  if (!isRecord(raw)) return DEFAULT_STOCK_PREFS;
  return { formats: readFormats(raw.formats), zoom: typeof raw.zoom === "number" ? Math.max(48, Math.min(200, raw.zoom)) : 90,
    destinations: readDestinations(raw.destinations), presets: readPresets(raw.presets) };
}
export function readFormats(raw: unknown): FormatSelection {
  if (!isRecord(raw)) return DEFAULT_STOCK_PREFS.formats;
  return { raster: raw.raster !== false, eps: raw.eps === true, svg: raw.svg === true, zip: raw.zip === true };
}
function readPresets(raw: unknown): StockPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(p => isRecord(p) && typeof p.name === "string" && p.name.trim() !== "" ? [{ name: p.name.slice(0, 80), formats: readFormats(p.formats) }] : []).slice(0, 50);
}
