// rejectedremoval.ts — "Remove unsuccessful uploads": the pasted names a stock
// site refused lose that stock's badge (undoable) and leave its upload history.

import { dropItemsFromBatches, matchRejectedItems, type RejectedMatch } from "../lib/stockupload/rejectedfiles";
import type { ExportedItem } from "../lib/stockupload/types";
import { badgesOf, ensureHardcodedBadges, findNamedBadge, removeBadgeFromIds, type RowBadgeState } from "../lib/upload/rowbadge";
import { getStockUploadBatches, replaceStockUploadBatches } from "./batchhistorystore";
import { markSitesRejected } from "./historystore";

export const REJECTED_REASON = "Rejected by the stock site";

export interface RejectedStock { id: string; name: string }

export interface RejectedRemovalInput {
  stock: RejectedStock;
  names: readonly string[];
  items: readonly ExportedItem[];
}

export interface RejectedRemovalResult {
  items: number;
  badges: number;
  historyFiles: number;
  statuses: number;
  unmatched: string[];
}

/** What a run of Process would touch, for the dialog's live preview. */
export function planRejectedRemoval(input: RejectedRemovalInput): RejectedMatch {
  return matchRejectedItems(input.names, { stockId: input.stock.id, batches: getStockUploadBatches(), items: input.items });
}

/** The badge state without this stock's badge on the matched items, and how many lost it. */
export function withoutStockBadge(
  state: RowBadgeState, stock: RejectedStock, itemIds: readonly string[],
): { after: RowBadgeState; removed: number } {
  const base = ensureHardcodedBadges(state);
  const badge = findNamedBadge(base, stock.name, stock.id);
  if (badge === null) return { after: state, removed: 0 };
  const removed = itemIds.filter((id) => badgesOf(base, id).includes(badge.id)).length;
  return { after: removed === 0 ? state : removeBadgeFromIds(base, itemIds, badge.id), removed };
}

/** Upload history and per-site status lose the matched items for this stock (not undoable: stored records). */
export function dropRejectedFromHistory(stockId: string, itemIds: readonly string[]): { historyFiles: number; statuses: number } {
  const dropped = dropItemsFromBatches(getStockUploadBatches(), stockId, new Set(itemIds));
  replaceStockUploadBatches(dropped.batches);
  return { historyFiles: dropped.removedFiles, statuses: markSitesRejected(itemIds, stockId, REJECTED_REASON) };
}

export function rejectedSummary(stockName: string, r: RejectedRemovalResult): string {
  const missing = r.unmatched.length > 0 ? ` · ${r.unmatched.length} name(s) not found` : "";
  return `${stockName}: badge removed from ${r.badges} of ${r.items} matched item(s), `
    + `${r.historyFiles} history file(s) removed${missing}`;
}
