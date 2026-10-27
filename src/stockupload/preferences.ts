import { useState } from "react";
import { readKey, writeKey } from "../state/safestorage";
import { parseStockPreferences, type StockPreferences } from "../lib/stockupload/preferences";
const KEY = "iconSplitter.stockUpload.preferences.v1";
function load(): StockPreferences {
  try { return parseStockPreferences(JSON.parse(readKey(KEY) || "null")); }
  catch { return parseStockPreferences(null); }
}
export function useStockPreferences() {
  const [prefs, set] = useState(load);
  function update(patch: Partial<StockPreferences>): void {
    set(before => { const next = parseStockPreferences({ ...before, ...patch }); writeKey(KEY, JSON.stringify(next)); return next; });
  }
  return { prefs, update };
}
