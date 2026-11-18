// metaimage.ts — what Gemini sees for sheet / artboard metadata (2026-11-14):
// the icons only, never the banner. The banner's strip is cut off the artboard
// and the banner turned off, so the icon area keeps its exact size and the grid
// lays out the same (only shifted). Pure; the PNG is rendered by preview.ts.
import type { SheetConfig } from "./types";

/** The sheet without its banner: the artboard shrinks by the banner strip on its side. */
export function iconsOnlyConfig(config: SheetConfig): SheetConfig {
  const { position, size } = config.banner;
  if (position === "none") return config;
  const side = position === "left" || position === "right";
  const artboard = side
    ? { ...config.artboard, width: Math.max(1, config.artboard.width - size) }
    : { ...config.artboard, height: Math.max(1, config.artboard.height - size) };
  return { ...config, artboard, banner: { ...config.banner, position: "none" } };
}

/** The largest size with the same aspect whose pixel count stays within `maxPixels` (default 1 MP). */
/** The shared megapixel sizing lives in the export-format domain (2026-11-17). */
export { megapixelSize } from "../exportformats";
