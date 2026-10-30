// prefsstore.ts — non-sensitive UI preferences for the "Upload" tab (RULE 13).

import { isRecord } from "../lib/isrecord";
import { DEFAULT_FTP_BRIDGE_URL } from "../lib/stockupload/bridgeclient";
import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { clampZoom, ZOOM_DEFAULT } from "../lib/zoom";
import { readKey, writeKey } from "../state/safestorage";

export const STOCK_PREFS_KEY = "iconSplitter.stockUpload.prefs.v1";

export interface StockUploadPrefs {
  thumb: number;
  bg: PreviewBackground;
  ftpOpen: boolean;
  bridgeUrl: string;
  combineTitleDescription: boolean;
}

export const DEFAULT_STOCK_PREFS: StockUploadPrefs = {
  thumb: ZOOM_DEFAULT,
  bg: DEFAULT_PREVIEW_BACKGROUND,
  ftpOpen: true,
  bridgeUrl: DEFAULT_FTP_BRIDGE_URL,
  combineTitleDescription: false,
};

export function loadStockPrefs(): StockUploadPrefs {
  const text = readKey(STOCK_PREFS_KEY);
  if (!text) return DEFAULT_STOCK_PREFS;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return DEFAULT_STOCK_PREFS;
    return {
      thumb: typeof raw.thumb === "number" ? clampZoom(raw.thumb) : DEFAULT_STOCK_PREFS.thumb,
      bg: parsePreviewBackground(raw.bg),
      ftpOpen: raw.ftpOpen !== false,
      combineTitleDescription: raw.combineTitleDescription === true,
      bridgeUrl: typeof raw.bridgeUrl === "string" && raw.bridgeUrl.trim() !== ""
        ? raw.bridgeUrl.trim()
        : DEFAULT_FTP_BRIDGE_URL,
    };
  } catch {
    return DEFAULT_STOCK_PREFS;
  }
}

export function saveStockPrefs(prefs: StockUploadPrefs): void {
  writeKey(STOCK_PREFS_KEY, JSON.stringify({ v: 1, ...prefs }));
}
