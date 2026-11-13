// getdatarows.ts — SVG to upload's checked rows for "Get data" (2026-11-10): the
// approved SVG, the AI PNG it came from, and the export status with the
// metadata state.

import { fileOf, type DataRow } from "../lib/getdata";
import type { UploadRow } from "./types";

export function uploadDataRows(rows: readonly UploadRow[], checked: readonly string[]): DataRow[] {
  const on = new Set(checked);
  return rows.filter((r) => on.has(r.source.id)).map((r) => ({
    svg: { name: r.source.svgName, path: r.source.svgPath },
    png: fileOf(r.source.aiPath),
    status: [r.status, `metadata ${r.meta.state}`],
  }));
}
