// stockoptions.ts — the stocks a history-style picker offers: every preset, plus
// stocks that only survive in saved upload history (a renamed or deleted preset).

import type { StockUploadBatch } from "../lib/stockupload/batchhistory";
import type { StockFtpPreset } from "../lib/stockupload/types";

export interface StockOption { id: string; name: string }

export function stockOptionsOf(presets: readonly StockFtpPreset[], batches: readonly StockUploadBatch[]): StockOption[] {
  const options = new Map(presets.map((preset) => [preset.id, { id: preset.id, name: preset.name }]));
  for (const batch of batches) if (!options.has(batch.stockId)) options.set(batch.stockId, { id: batch.stockId, name: batch.stockName });
  return [...options.values()];
}
