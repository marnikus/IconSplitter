// getdatarows.ts — the SVG builder's placed icons for "Get data" (2026-11-10):
// the approved SVG file and its path. The builder only reads approved SVGs.

import type { DataRow } from "../lib/getdata";
import { fileOf } from "../lib/getdata";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";

export function builderDataRows(assets: readonly Pick<BuilderIconAsset, "id" | "svgPath" | "svgName">[], placed: readonly string[]): DataRow[] {
  const on = new Set(placed);
  return assets.filter((a) => on.has(a.id)).map((a) => ({ svg: fileOf(a.svgPath) ?? { name: a.svgName, path: "" }, png: null, status: ["Approved"] }));
}
