import { readStockSelection } from "../lib/stockupload/selection";
import { applyRowGesture, sameRowSelection, type RowGesture, type RowSelection } from "../lib/reviewselect";
import type { HistoryActions } from "../state/HistoryProvider";
import { patchStock, stockState } from "./state";
export function applyStockSelection(raw: unknown): boolean {
  const next = readStockSelection(raw); if (!next) return false;
  const known = new Set(stockState().rows.map(r => r.id));
  const targets = [...next.checked, next.active, next.anchor].filter((id): id is string => id !== null);
  if (targets.some(id => !known.has(id))) return false;
  patchStock({ selection: next }); return true;
}
export function commitStockSelection(next: RowSelection, history: HistoryActions): void {
  const before = stockState().selection;
  if (sameRowSelection(before, next)) return;
  patchStock({ selection: next });
  history.push({ type: "stockSelection", origin: "stockUpload", label: "Change Upload selection", ids: next.checked, before, after: next });
}
export function stockRowGesture(gesture: RowGesture, history: HistoryActions): void {
  commitStockSelection(applyRowGesture(stockState().selection, gesture), history);
}

