// getdatarows.ts — Batch folders' rows for "Get data" (2026-11-10): the selected
// images (PNG), their paths, and their split status with the review decision.

import type { DataRow } from "../lib/getdata";
import type { Row } from "./useBatchTypes";

export function batchDataRows(rows: readonly Pick<Row, "name" | "relPath" | "status" | "review" | "selected">[]): DataRow[] {
  return rows.filter((r) => r.selected).map((r) => ({ svg: null, png: { name: r.name, path: r.relPath }, status: [r.status, r.review] }));
}
