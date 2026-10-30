// presetstore.ts — localStorage persistence for non-sensitive Stock FTP presets.

import {
  DEFAULT_STOCK_STATE, parseStockPresetState, serializeStockPresetState,
} from "../lib/stockupload/presets";
import type { StockPresetState } from "../lib/stockupload/types";
import { readKey, writeKey } from "../state/safestorage";

export const STOCK_PRESETS_KEY = "iconSplitter.stockUpload.presets.v1";

function readAndHealPresetState(): StockPresetState {
  const raw = readKey(STOCK_PRESETS_KEY);
  const parsed = parseStockPresetState(raw);
  if (raw !== null) {
    const healed = serializeStockPresetState(parsed);
    if (healed !== raw) writeKey(STOCK_PRESETS_KEY, healed);
  }
  return parsed;
}

const listeners = new Set<() => void>();
let cached: StockPresetState = readAndHealPresetState();

function notify(): void {
  for (const fn of listeners) fn();
}

export function getStockPresetState(): StockPresetState {
  return cached;
}

export function subscribeStockPresets(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function loadStockPresetState(): StockPresetState {
  cached = readAndHealPresetState();
  return cached;
}

export const loadStockPresets = loadStockPresetState;

export function saveStockPresetState(next: StockPresetState): StockPresetState {
  const serialized = serializeStockPresetState(next);
  cached = parseStockPresetState(serialized);
  writeKey(STOCK_PRESETS_KEY, serialized);
  notify();
  return cached;
}

export const setStockPresetState = saveStockPresetState;

export function resetStockPresetStore(): void {
  cached = DEFAULT_STOCK_STATE;
  notify();
}

export const resetStockPresets = resetStockPresetStore;
