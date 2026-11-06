// listview.ts — Upload's remembered list view (2026-11-06): format and badge
// filters (one value or several), the search text and the sort, restored after
// a reload and validated on read (RULE 13).

import { isRecord } from "../lib/isrecord";
import { parseAnyMulti, parseMulti } from "../lib/multifilter";
import { LIST_VIEW_KEYS, loadListView } from "../state/listviewstore";
import type { StockListFilter, StockUploadSort } from "./rowlist";

export interface StockListView { filter: StockListFilter; sort: StockUploadSort }

const FORMATS = ["all", "raster", "svg", "eps", "zip"] as const;
const SORTS: StockUploadSort[] = ["name", "path", "selected"];

export function parseStockListView(raw: unknown): StockListView {
  const v = isRecord(raw) ? raw : {};
  const f = isRecord(v.filter) ? v.filter : {};
  return {
    filter: {
      format: parseMulti(f.format, FORMATS, "all"),
      badge: parseAnyMulti(f.badge, "all"),
      search: typeof f.search === "string" ? f.search : "",
    },
    sort: SORTS.includes(v.sort as StockUploadSort) ? (v.sort as StockUploadSort) : "path",
  };
}

export const loadStockListView = (): StockListView => loadListView(LIST_VIEW_KEYS.stock, parseStockListView);
