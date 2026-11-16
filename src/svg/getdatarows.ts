// getdatarows.ts — Generate SVG's checked rows for "Get data" (2026-11-10): the
// AI source PNG, the shown version's SVG (none before the first generation),
// and the generation status with the review status.

import { fileOf, type DataRow } from "../lib/getdata";
import { REVIEW_LABEL } from "../lib/svgmodel";
import { previewTargetOf } from "./rowmodel";
import type { RowStatus, SvgRow } from "./types";

const GENERATION: Record<RowStatus, string> = {
  "not-generated": "Not generated", generating: "Generating", generated: "Generated", failed: "Failed", unknown: "Unknown",
};

export function svgDataRows(rows: readonly SvgRow[], checked: readonly string[]): DataRow[] {
  const on = new Set(checked);
  return rows.filter((r) => on.has(r.source.id)).map((r) => ({
    svg: fileOf(previewTargetOf(r)?.svgPath ?? ""),
    png: { name: r.source.name, path: r.source.relPath },
    status: [GENERATION[r.status], REVIEW_LABEL[r.review]],
  }));
}
