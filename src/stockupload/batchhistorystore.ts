// batchhistorystore.ts — bounded, validated local history of stock upload runs.

import { isRecord } from "../lib/isrecord";
import { parseStockUploadBatch, type StockUploadBatch } from "../lib/stockupload/batchhistory";
import { readKey, writeKey } from "../state/safestorage";

export const STOCK_UPLOAD_BATCH_HISTORY_KEY = "iconSplitter.stockUpload.batches.v1";
const MAX_BATCHES = 200;
const EMPTY: StockUploadBatch[] = [];
let current = parseBatches(readKey(STOCK_UPLOAD_BATCH_HISTORY_KEY));
const listeners = new Set<() => void>();

function parseBatches(text: string | null): StockUploadBatch[] {
  if (text === null) return EMPTY;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.batches)) return EMPTY;
    return raw.batches.map(parseStockUploadBatch).filter((batch): batch is StockUploadBatch => batch !== null).slice(-MAX_BATCHES);
  } catch {
    return EMPTY;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(batches: readonly StockUploadBatch[]): void {
  current = batches.slice(-MAX_BATCHES);
  writeKey(STOCK_UPLOAD_BATCH_HISTORY_KEY, JSON.stringify({ v: 1, batches: current }));
  notify();
}

export function loadStockUploadBatches(): StockUploadBatch[] {
  current = parseBatches(readKey(STOCK_UPLOAD_BATCH_HISTORY_KEY));
  return current;
}

export function getStockUploadBatches(): StockUploadBatch[] {
  return current;
}

export function batchesForStock(stockId: string): StockUploadBatch[] {
  return current.filter((batch) => batch.stockId === stockId).slice().reverse();
}

export function appendStockUploadBatch(batch: StockUploadBatch): void {
  const valid = parseStockUploadBatch(batch);
  if (valid !== null) persist([...current, valid]);
}

export function subscribeStockUploadBatches(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function resetStockUploadBatches(): void {
  current = EMPTY;
  writeKey(STOCK_UPLOAD_BATCH_HISTORY_KEY, JSON.stringify({ v: 1, batches: current }));
  notify();
}
