import { readKey, writeKey } from "../state/safestorage";
import { readStockSelection, EMPTY_STOCK_SELECTION } from "../lib/stockupload/selection";
import { useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { RowSelection } from "../lib/reviewselect";
import type { StockPackage, TransferReceipt } from "../lib/stockupload/types";
export interface StockState {
  root: DirHandleLike | null; rows: StockPackage[]; errors: string[]; scanning: boolean;
  selection: RowSelection; message: string; receipts: TransferReceipt[]; busy: boolean; canCancel: boolean;
}
let state: StockState = { root: null, rows: [], errors: [], scanning: false, selection: loadSelection(), message: "", receipts: [], busy: false, canCancel: false };
const listeners = new Set<() => void>();
export function stockState(): StockState { return state; }
export function patchStock(patch: Partial<StockState>): void { state = { ...state, ...patch }; if (patch.selection) writeKey(SELECTION_KEY, JSON.stringify(patch.selection)); for (const l of listeners) l(); }
function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useStockState(): StockState { return useSyncExternalStore(subscribe, stockState, stockState); }

const SELECTION_KEY = "iconSplitter.stockUpload.selection.v1";
function loadSelection(): RowSelection {
  try { return readStockSelection(JSON.parse(readKey("iconSplitter.stockUpload.selection.v1") || "null")) || EMPTY_STOCK_SELECTION; }
  catch { return EMPTY_STOCK_SELECTION; }
}
