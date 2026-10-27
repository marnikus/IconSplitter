import { isRecord } from "../isrecord";
import type { RowSelection } from "../reviewselect";
export const EMPTY_STOCK_SELECTION: RowSelection = { active: null, anchor: null, checked: [] };
export function readStockSelection(raw: unknown): RowSelection | null {
  if (!isRecord(raw) || !Array.isArray(raw.checked) || !raw.checked.every(id => typeof id === "string")) return null;
  if (!nullableId(raw.active) || !nullableId(raw.anchor)) return null;
  return { checked: [...new Set(raw.checked)] as string[], active: raw.active, anchor: raw.anchor };
}
function nullableId(raw: unknown): raw is string | null { return raw === null || typeof raw === "string"; }
