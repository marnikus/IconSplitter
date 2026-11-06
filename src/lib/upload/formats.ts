// Output selection is separate from the shared, in-memory SVG preparation.
// Absent SVG/JPEG flags are legacy packages/settings: both default to enabled.
export interface FormatSelection { includeSvg?: boolean; includeJpeg?: boolean; includeEps: boolean }

export function outputFormats(settings: FormatSelection): { svg: boolean; jpg: boolean; eps: boolean } {
  return { svg: settings.includeSvg !== false, jpg: settings.includeJpeg !== false, eps: settings.includeEps };
}

export function hasOutputFormats(settings: FormatSelection): boolean {
  return Object.values(outputFormats(settings)).some(Boolean);
}

export const NO_OUTPUT_FORMATS = "Select at least one export format: SVG, JPEG or EPS";
