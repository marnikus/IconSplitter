// getdatarows.ts — the stock Upload tab's checked items for "Get data"
// (2026-11-10): the exported SVG and PNG (a JPEG is not a PNG), and what each
// stock says about the item — "Adobe Stock: uploaded" — or "not uploaded".

import type { DataRow } from "../lib/getdata";
import type { ExportedFileRef, ExportedItem, StockHistoryMap } from "../lib/stockupload/types";

const file = (ref: ExportedFileRef | null, ext: ExportedFileRef["ext"]) =>
  (ref !== null && ref.ext === ext ? { name: ref.fileName, path: ref.relPath } : null);

export function stockDataRows(
  items: readonly ExportedItem[], checked: readonly string[], history: StockHistoryMap, names: ReadonlyMap<string, string>,
): DataRow[] {
  const on = new Set(checked);
  return items.filter((i) => on.has(i.id)).map((i) => {
    const sites = Object.entries(history[i.id] ?? {}).map(([stock, s]) => `${names.get(stock) ?? stock}: ${s.status}`);
    return { svg: file(i.files.svg, "svg"), png: file(i.files.raster, "png"), status: sites.length > 0 ? sites : ["not uploaded"] };
  });
}
