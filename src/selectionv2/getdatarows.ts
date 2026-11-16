// getdatarows.ts — Selection V2's checked pairs for "Get data" (2026-11-10): the
// AI image of each pair (the original when the AI image is missing), its path,
// and the review decision. List order, not click order.

import { fileOf, type DataRow } from "../lib/getdata";
import type { ViewPair } from "../lib/reviewfilter";

export function pairDataRows(pairs: readonly ViewPair[], checked: readonly string[]): DataRow[] {
  const on = new Set(checked);
  return pairs.filter((p) => on.has(p.pairId)).map((p) => ({
    svg: null, png: fileOf((p.ai ?? p.source)?.relPath ?? ""), status: [p.decision],
  }));
}
