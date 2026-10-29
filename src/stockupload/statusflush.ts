// statusflush.ts — writes each item's upload outcome into the row status store.

import type { StockUploadOutcome } from "../lib/stockupload/types";
import { recordSiteUploadStatus } from "./historystore";
import { clearUploadInFlight } from "./journal";
import type { ItemTracker } from "./trackers";

export function outcomeOf(tr: ItemTracker): StockUploadOutcome {
  if (tr.succeeded.length === 0) return "failed";
  if (tr.succeeded.length === tr.expected && tr.missingCount === 0) return "uploaded";
  return "partial";
}

export function flushTargetStatuses(targetId: string, trackers: Map<string, ItemTracker>): void {
  const now = new Date().toISOString();
  for (const [itemId, tr] of trackers.entries()) {
    clearUploadInFlight(itemId, targetId);
    recordSiteUploadStatus(itemId, targetId, {
      status: outcomeOf(tr),
      formats: tr.succeeded,
      uploadedAt: now,
      error: tr.lastError,
    });
  }
}
