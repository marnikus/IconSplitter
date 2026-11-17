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
export function megapixelSize(width: number, height: number, maxPixels = 1_000_000): { width: number; height: number } {
  const ratio = width / Math.max(1, height);
  let w = Math.max(1, Math.floor(Math.sqrt(maxPixels * ratio)));
  let h = Math.max(1, Math.floor(w / ratio));
  while (w * h > maxPixels) { w -= 1; h = Math.max(1, Math.floor(w / ratio)); }
  return { width: w, height: h };
}
