// formatwiring.ts — how the builder's stored format options become the
// `UploadSettings` the shared package pipeline reads (2026-11-19). Before this
// the export merged the SVG to upload tab's DEFAULTS in, so that tab's
// background, padding, artboard, shadow and badge silently shaped a sheet's
// JPEG/EPS flatten colour and its recorded settings. A sheet is composed, never
// decorated by another tab: the builder takes the neutral defaults and only its
// own stored format domain on top.
import type { ExportFormatOptions } from "../lib/exportformats";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../lib/upload/settings";

export function builderExportSettings(formats: ExportFormatOptions): UploadSettings {
  return { ...DEFAULT_UPLOAD_SETTINGS, ...formats };
}
