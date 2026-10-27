import { makeTransferPlan } from "../lib/stockupload/plan";
import type { FormatSelection, StockPackage, TransferPlan } from "../lib/stockupload/types";
export function safeStockPlan(rows: StockPackage[], formats: FormatSelection, reviewed: boolean): TransferPlan {
  try { return makeTransferPlan(rows, formats, reviewed); }
  catch (e) { return { files: [], excluded: [String(e)], bytes: 0 }; }
}

export function epsReviewKey(rows: StockPackage[]): string {
  return rows.flatMap(row => row.artifacts.filter(a => a.kind === "eps").map(a => `${a.path}:${a.hash}`)).join("|");
}
