// metaimagefor.ts — the ONE image a metadata request sends (2026-11-14): the
// sheet's icons without the banner (metaimage.ts), composed like the export and
// drawn by the PNG export's renderer at most 1 megapixel (preview.ts).
import { composeSheet } from "../lib/svgBuilder/compose";
import { computeLayout } from "../lib/svgBuilder/layout";
import { iconsOnlyConfig } from "../lib/svgBuilder/metaimage";
import type { BuilderIconAsset, SheetConfig } from "../lib/svgBuilder/types";
import { sheetPngFor, type SheetPngDeps, type SheetPreviewResult } from "./preview";

export interface IconsImageArgs {
  config: SheetConfig;
  assets: readonly BuilderIconAsset[];
  placedIds: readonly string[];
  svgTexts: Readonly<Record<string, string>>;
}

export async function iconsImageFor(args: IconsImageArgs, deps: SheetPngDeps = {}): Promise<SheetPreviewResult> {
  const config = iconsOnlyConfig(args.config);
  const doc = composeSheet({ config, layout: computeLayout(config), assets: args.assets, placedIds: args.placedIds, svgTexts: args.svgTexts });
  return sheetPngFor(doc.svg, deps);
}
