// historystore.ts — non-sensitive per-(item, stock) upload status history (RULE 13).

import { isRecord } from "../lib/isrecord";
import { FORMAT_ORDER } from "../lib/stockupload/plan";
import type { StockHistoryMap, StockSiteStatus, StockUploadOutcome, UploadFormatKey } from "../lib/stockupload/types";
import { readKey, writeKey } from "../state/safestorage";

export const STOCK_HISTORY_KEY = "iconSplitter.stockUpload.history.v1";
const MAX_ITEMS = 1024;
const OUTCOMES: readonly StockUploadOutcome[] = ["uploaded", "partial", "failed", "interrupted"];

let current: StockHistoryMap = parseHistory(readKey(STOCK_HISTORY_KEY));
const listeners = new Set<() => void>();

function isOutcome(v: unknown): v is StockUploadOutcome {
  return typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);
}

function parseSiteStatus(raw: unknown): StockSiteStatus | null {
  if (!isRecord(raw) || !isOutcome(raw.status) || typeof raw.uploadedAt !== "string") return null;
  const formats = Array.isArray(raw.formats)
    ? raw.formats.filter((f): f is UploadFormatKey => typeof f === "string" && (FORMAT_ORDER as readonly string[]).includes(f))
    : [];
  const error = typeof raw.error === "string" && raw.error !== "" ? raw.error.slice(0, 300) : null;
  return { status: raw.status, formats, uploadedAt: raw.uploadedAt, error };
}

function parseItemSites(sites: unknown): Record<string, StockSiteStatus> | null {
  if (!isRecord(sites)) return null;
  const parsedSites: Record<string, StockSiteStatus> = {};
  for (const [siteId, status] of Object.entries(sites)) {
    const s = parseSiteStatus(status);
    if (s !== null) parsedSites[siteId] = s;
  }
  return Object.keys(parsedSites).length > 0 ? parsedSites : null;
}

function parseHistory(text: string | null): StockHistoryMap {
  if (!text) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.history)) return {};
    const out: StockHistoryMap = {};
    for (const [itemId, sites] of Object.entries(raw.history).slice(-MAX_ITEMS)) {
      const parsed = parseItemSites(sites);
      if (parsed !== null) out[itemId] = parsed;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: StockHistoryMap): void {
  const entries = Object.entries(next).slice(-MAX_ITEMS);
  current = Object.fromEntries(entries);
  writeKey(STOCK_HISTORY_KEY, JSON.stringify({ v: 1, history: current }));
  for (const fn of listeners) fn();
}

export function getStockHistory(): StockHistoryMap {
  return current;
}

export function loadStockHistory(): StockHistoryMap {
  current = parseHistory(readKey(STOCK_HISTORY_KEY));
  return current;
}

export function recordSiteUploadStatus(itemId: string, targetId: string, status: StockSiteStatus): void {
  const prevItem = current[itemId] ?? {};
  persist({ ...current, [itemId]: { ...prevItem, [targetId]: status } });
}

export function subscribeStockHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function resetStockHistory(): void {
  current = {};
  for (const fn of listeners) fn();
}
